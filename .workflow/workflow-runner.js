#!/usr/bin/env node
import { exec, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPEC = path.join(__dirname, "workflow.yaml");

function parseArgs(argv) {
  const [command = "help", workflowName, ...rest] = argv;
  const options = {
    command,
    workflowName,
    inputs: {},
    spec: DEFAULT_SPEC,
    cwd: path.resolve(__dirname, '..'),
    dryRun: false,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--input" || token === "-i") {
      const pair = rest[++i];
      const eq = pair?.indexOf("=") ?? -1;
      if (!pair || eq === -1) throw new Error("--input must use key=value");
      options.inputs[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (token === "--spec") {
      options.spec = path.resolve(rest[++i]);
    } else if (token === "--cwd") {
      options.cwd = path.resolve(rest[++i]);
    } else if (token === "--dry-run") {
      options.dryRun = true;
    } else if (token === "--attempt-count") {
      options.inputs.attempt_count = Number(rest[++i]);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function adapterConfig(env = process.env) {
  const aiAdapter = env.WORKFLOW_AI_ADAPTER ?? "placeholder";
  const lowModelMode = env.WORKFLOW_LOW_MODEL_MODE ?? "record";
  const ollamaBaseUrl = env.WORKFLOW_OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
  const hermesPath = env.WORKFLOW_HERMES_PATH ?? "C:\\Users\\ml042\\Projects\\Hermes-Agent\\venv\\Scripts\\hermes.exe";
  return {
    ai: {
      adapter: aiAdapter,
      baseUrl: env.WORKFLOW_AI_BASE_URL ?? (aiAdapter === "ollama" ? ollamaBaseUrl : "https://api.openai.com/v1"),
      model: env.WORKFLOW_AI_MODEL ?? (aiAdapter === "ollama" ? "llama3.1" : ""),
      apiKey: env.WORKFLOW_AI_API_KEY ?? "",
      timeoutMs: Number(env.WORKFLOW_AI_TIMEOUT_MS ?? 30000),
      maxTokens: Number(env.WORKFLOW_AI_MAX_TOKENS ?? 800),
    },
    lowModel: {
      mode: lowModelMode,
      baseUrl: env.WORKFLOW_LOW_MODEL_BASE_URL ?? ollamaBaseUrl,
      model: env.WORKFLOW_LOW_MODEL ?? env.WORKFLOW_OLLAMA_MODEL ?? "llama3.1",
      apiKey: env.WORKFLOW_LOW_MODEL_API_KEY ?? "",
      command: env.WORKFLOW_LOW_MODEL_COMMAND ?? "",
      hermesPath,
      smallProvider: env.WORKFLOW_HERMES_SMALL_PROVIDER ?? "ollama-nemotron-3-super-cloud",
      smallModel: env.WORKFLOW_HERMES_SMALL_MODEL ?? "nemotron-3-super:cloud",
      fallbackProvider: env.WORKFLOW_HERMES_FALLBACK_PROVIDER ?? "github-copilot",
      fallbackModel: env.WORKFLOW_HERMES_FALLBACK_MODEL ?? "gpt-5-mini",
      delegateInDryRun: env.WORKFLOW_DELEGATE_IN_DRY_RUN === "1",
      timeoutMs: Number(env.WORKFLOW_LOW_MODEL_TIMEOUT_MS ?? 20000),
      maxTokens: Number(env.WORKFLOW_LOW_MODEL_MAX_TOKENS ?? 400),
    },
  };
}

async function loadSpec(specPath) {
  const raw = await readFile(specPath, "utf8");
  const spec = YAML.parse(raw);
  if (!spec?.workflows || typeof spec.workflows !== "object") {
    throw new Error("workflow spec must define workflows");
  }
  return spec;
}

function usage(specPath = DEFAULT_SPEC) {
  return [
    "Usage:",
    "  node workflow-runner.js list [--spec workflow.yaml]",
    "  node workflow-runner.js runners [--spec workflow.yaml]",
    "  node workflow-runner.js adapters [--spec workflow.yaml]",
    "  node workflow-runner.js plan <workflow> --input key=value ...",
    "  node workflow-runner.js run <workflow> --input key=value ... [--dry-run] [--cwd path]",
    "  node workflow-runner.js validate [--spec workflow.yaml]",
    "",
    "Examples:",
    "  node workflow-runner.js list",
    "  node workflow-runner.js runners",
    "  node workflow-runner.js adapters",
    "  node workflow-runner.js plan pr-review -i base_ref=main -i target_ref=HEAD",
    "  node workflow-runner.js run bug-scan -i symptom=\"Import repeats prompt\" --dry-run",
    "",
    `Default spec: ${specPath}`,
  ].join("\n");
}

function requiredInputs(workflow) {
  return workflow.inputs?.required?.map((item) => item.name) ?? [];
}

function validateInputs(workflowName, workflow, inputs) {
  const missing = requiredInputs(workflow).filter((name) => !hasValue(inputs[name]));
  if (missing.length > 0) {
    throw new Error(`${workflowName} missing required input(s): ${missing.join(", ")}`);
  }
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).length > 0;
}

function interpolate(template, context) {
  return String(template).replace(/\{([^}]+)\}/g, (_, key) => {
    const value = getPath(context, key.trim());
    return value === undefined ? `{${key}}` : String(value);
  });
}

function getPath(source, expr) {
  if (!expr) return undefined;
  return String(expr)
    .split(".")
    .reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function commandForStep(workflow, step, context) {
  if (step.command_ref) {
    const template = workflow.evidence?.commands?.[step.command_ref];
    if (!template) throw new Error(`Missing command_ref '${step.command_ref}'`);
    return interpolate(template, context);
  }
  return null;
}

function shouldRun(step, context) {
  if (!step.when) return true;
  return evaluateWhen(step.when, context);
}

function evaluateWhen(expression, context) {
  return String(expression)
    .split(/\s+or\s+/i)
    .some((part) => evaluateWhenPart(part.trim(), context));
}

function evaluateWhenPart(part, context) {
  let match = part.match(/^(.+?)\s+is provided$/);
  if (match) return hasValue(getPath(context, match[1].trim()));

  match = part.match(/^(.+?)\s+is not empty$/);
  if (match) {
    const value = getPath(context, match[1].trim());
    return Array.isArray(value) ? value.length > 0 : hasValue(value);
  }

  match = part.match(/^(.+?)\s+in\s+(.+)$/);
  if (match) {
    const needle = match[1].trim();
    const haystack = getPath(context, match[2].trim());
    return Array.isArray(haystack) && haystack.includes(needle);
  }

  match = part.match(/^(.+?)\s+is\s+(true|false)$/);
  if (match) {
    return Boolean(getPath(context, match[1].trim())) === (match[2] === "true");
  }

  match = part.match(/^(.+?)\s+is\s+(.+)$/);
  if (match) {
    return String(getPath(context, match[1].trim())) === match[2].trim();
  }

  match = part.match(/^(.+?)\s*>=\s*(\d+)$/);
  if (match) {
    return Number(getPath(context, match[1].trim()) ?? 0) >= Number(match[2]);
  }

  return false;
}

function outputKey(step) {
  return step.output ?? step.id;
}

function classifyChange(rawDiff = "", changedFiles = "") {
  const files = changedFiles
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).at(-1))
    .filter(Boolean);

  const changeKinds = new Set();
  const filesRequiringCallers = [];

  for (const file of files) {
    if (/api|route|controller|server|command/i.test(file)) {
      changeKinds.add("api");
      filesRequiringCallers.push(file);
    }
    if (/\.(vue|tsx|jsx|css|scss|html)$/i.test(file)) changeKinds.add("ui");
    if (/store|state|reducer|composable|hook/i.test(file)) changeKinds.add("state");
    if (/migration|schema|db|sqlite|sql/i.test(file)) changeKinds.add("database");
    if (/config|package\.json|vite|tauri|tsconfig/i.test(file)) changeKinds.add("config");
    if (/util|shared|lib|common/i.test(file)) {
      changeKinds.add("shared-util");
      filesRequiringCallers.push(file);
    }
    if (/test|spec|__tests__/i.test(file)) changeKinds.add("tests");
    if (/\.md$/i.test(file)) changeKinds.add("docs");
  }

  if (rawDiff.includes("fetch(") || rawDiff.includes("invoke(")) changeKinds.add("api");

  return {
    change_kinds: [...changeKinds],
    risk_areas: [...changeKinds].map((kind) => `${kind} change detected`),
    files_requiring_callers: [...new Set(filesRequiringCallers)],
  };
}

function explainSymptom(inputs) {
  const symptom = inputs.symptom ?? "";
  const error = inputs.error_message ?? "";
  const keywords = extractKeywordsFromParts([symptom, error], 12, 16);
  return {
    plain_language_meaning: error
      ? `The reported symptom is '${symptom}', with error '${error}'.`
      : `The reported symptom is '${symptom}'.`,
    initial_hypotheses: [
      "input data does not match the expected shape",
      "state or async flow is stale",
      "the failing path differs from the assumed path",
    ],
    keywords,
  };
}

function traceDataFlow(context) {
  const hits = String(context.code_hits ?? context.error_hits ?? "");
  const files = [...new Set([...hits.matchAll(/^.*?([A-Za-z]:\\[^\n:]+|\.\/[^\n:]+|[^\s:]+\.[A-Za-z0-9]+):\d+/gm)].map((m) => m[1]))];
  return {
    entry_points: files.slice(0, 5),
    data_flow: ["input", "transform", "side effect or render"],
    likely_breakpoints: ["first transform after input", "boundary before render/save"],
    files_to_read: files.slice(0, 8),
  };
}

function diagnose(context) {
  return {
    root_cause_candidate: "needs human/AI confirmation from focused source and runtime evidence",
    confidence: "medium",
    minimal_fix_plan: "inspect focused files, confirm failing branch, then patch the smallest owner module",
    probe_needed: Number(context.attempt_count ?? 0) >= 2,
  };
}

function summarizeIssue(context) {
  const raw = String(context.issue_json ?? "");
  let issue = {};
  try {
    issue = JSON.parse(raw);
  } catch {
    issue = { title: context.focus ?? "", body: raw };
  }
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((label) => label.name).filter(Boolean)
    : [];
  const title = issue.title ?? context.focus ?? "";
  const body = issue.body ?? "";
  const focus = context.focus ?? "";
  const searchableTextParts = [title, body, focus];

  // Extract file paths from backtick-quoted patterns (e.g. `src/composables/useContextMenu.ts`)
  const searchableText = searchableTextParts.filter(Boolean).join("\n");
  const backtickPaths = [...searchableText.matchAll(/`([^`]+\.[a-z]{2,4})`/gi)]
    .map((m) => m[1].trim())
    .filter((p) => /[/\\]/.test(p));

  // Extract symbol names (camelCase / PascalCase)
  const symbols = [...new Set(searchableText.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b|\b[a-z]+(?:[A-Z][a-z]+)+\b/g) ?? [])]
    .filter((s) => s.length > 3 && !/^(http|https|www)$/i.test(s));

  const candidate_symbols = [...new Set([...backtickPaths, ...symbols])].slice(0, 10);
  const structuralTerms = [
    ...symbols.slice(0, 5),
    ...backtickPaths.map((p) => p.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "")).filter(Boolean),
  ];
  const keywordTerms = uniqueByNormalized([
    ...structuralTerms,
    ...extractKeywordsFromParts(searchableTextParts, 18, 30),
  ]);
  const issue_keywords = keywordTerms.length > 0 ? keywordTerms.map(escapeRegex).join("|") : ".";

  return {
    plain_language_goal: title || "Issue goal requires adapter review",
    acceptance_checks: [
      "issue-relevant behavior changed",
      "project verification commands passed",
      "issue closeout completed when pushed",
    ],
    candidate_symbols,
    labels,
    issue_keywords,
  };
}

function aiPlaceholder(step, context) {
  if (step.id === "classify-change") return classifyChange(context.raw_diff, context.changed_files);
  if (step.id === "explain-symptom") return explainSymptom(context);
  if (step.id === "summarize-issue") return summarizeIssue(context);
  if (step.id === "trace-data-flow") return traceDataFlow(context);
  if (step.id === "diagnose") return diagnose(context);
  return {
    status: "needs_ai_adapter",
    step: step.id,
    message: "Prompt artifact was generated; connect an AI adapter to produce this step output.",
  };
}

function buildPrompt(workflowName, step, context) {
  const payload = {
    workflow: workflowName,
    step: step.id,
    type: step.type,
    requested_output: step.output_schema ?? step.output_format ?? "structured notes",
    checks: step.checks ?? [],
    report_contract: step.report_contract ?? undefined,
    input: Object.fromEntries((step.input ?? []).map((key) => [key, getPath(context, key) ?? null])),
  };
  return [
    `# Workflow AI Step: ${workflowName}/${step.id}`,
    "",
    "You are an adapter for a portable engineering workflow.",
    "Use only the provided context. Return the requested structure.",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
  ].join("\n");
}

function parseAdapterContent(content, step) {
  const text = String(content ?? "").trim();
  if (!text) return { status: "empty_ai_response" };

  const jsonText = text.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim() ?? text;
  if (step.output_schema?.type === "object") {
    try {
      return JSON.parse(jsonText);
    } catch {
      return { status: "unparseable_json", raw: text };
    }
  }
  return { status: "ok", markdown: text };
}

async function callChatCompletions({ baseUrl, model, apiKey, timeoutMs = 30000, maxTokens = 800 }, messages) {
  if (!model) throw new Error("AI adapter requires WORKFLOW_AI_MODEL or WORKFLOW_LOW_MODEL");
  if (typeof fetch !== "function") throw new Error("This Node runtime does not provide fetch()");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let body;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
    body = await response.text();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`chat completions timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`chat completions failed (${response.status}): ${body}`);
  }
  const parsed = JSON.parse(body);
  return parsed.choices?.[0]?.message?.content ?? "";
}

async function runAiStep(workflowName, step, context, runDir, config) {
  const prompt = buildPrompt(workflowName, step, context);
  const promptPath = path.join(runDir, `${step.id}.prompt.md`);
  await writeFile(promptPath, prompt, "utf8");

  if (config.ai.adapter === "placeholder") {
    return {
      status: "prompt-generated",
      promptPath,
      output: aiPlaceholder(step, context),
    };
  }

  if (!["openai-compatible", "ollama"].includes(config.ai.adapter)) {
    return {
      status: "ai-adapter-error",
      promptPath,
      output: { status: "unsupported_ai_adapter", adapter: config.ai.adapter },
    };
  }

  try {
    const content = await callChatCompletions(config.ai, [
      {
        role: "system",
        content: "You are an adapter for a portable engineering workflow. Use only the provided context and return the requested structure.",
      },
      { role: "user", content: prompt },
    ]);
    const output = parseAdapterContent(content, step);
    return { status: "ai-completed", promptPath, output, rawContent: content };
  } catch (error) {
    return {
      status: "ai-adapter-error",
      promptPath,
      output: { status: "ai_adapter_error", message: error.message },
    };
  }
}

async function runShell(command, cwd) {
  return new Promise((resolve) => {
    exec(command, { cwd, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        command,
        exitCode: error?.code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

async function runExecutable(file, args, cwd) {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        command: [file, ...args].join(" "),
        exitCode: error?.code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

async function writeDelegationPacket(runDir, step, packet) {
  const packetPath = path.join(runDir, `${step.id}.low-model.packet.json`);
  await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  return packetPath;
}

async function runLowModelDelegation(packet, packetPath, config, cwd, dryRun = false) {
  if (!packet.task_class || packet.delegate !== "allowed") {
    return { status: "not-delegable" };
  }

  if (config.lowModel.mode === "off") {
    return { status: "disabled" };
  }

  if (config.lowModel.mode === "record") {
    return { status: "packet-recorded", packetPath };
  }

  if (dryRun && !config.lowModel.delegateInDryRun) {
    return { status: "packet-recorded-dry-run", packetPath };
  }

  if (config.lowModel.mode === "command") {
    if (!config.lowModel.command) {
      return { status: "low-model-command-missing", packetPath };
    }
    const command = config.lowModel.command.includes("{packet}")
      ? config.lowModel.command.replaceAll("{packet}", `"${packetPath}"`)
      : `${config.lowModel.command} "${packetPath}"`;
    const result = await runShell(command, cwd);
    return { status: result.exitCode === 0 ? "delegated-command-completed" : "delegated-command-failed", packetPath, result };
  }

  if (config.lowModel.mode === "hermes") {
    const ollamaProbe = await runShell("ollama --version", cwd);
    const useSmall = ollamaProbe.exitCode === 0;
    const provider = useSmall ? config.lowModel.smallProvider : config.lowModel.fallbackProvider;
    const model = useSmall ? config.lowModel.smallModel : config.lowModel.fallbackModel;
    const hermes = existsSync(config.lowModel.hermesPath) ? config.lowModel.hermesPath : "hermes";
    const result = await runExecutable(
      hermes,
      ["--provider", provider, "--model", model, "-z", JSON.stringify(packet, null, 2)],
      cwd,
    );
    return {
      status: result.exitCode === 0 ? "delegated-hermes-completed" : "delegated-hermes-failed",
      runner: useSmall ? "local-small-worker" : "remote-general-worker",
      provider,
      model,
      packetPath,
      result,
    };
  }

  if (config.lowModel.mode === "ollama-review") {
    try {
      const content = await callChatCompletions(
        {
          baseUrl: config.lowModel.baseUrl,
          model: config.lowModel.model,
          apiKey: config.lowModel.apiKey,
        },
        [
          {
            role: "system",
            content: [
              "You are a low-judgment workflow worker.",
              "Do not choose architecture, root cause, or new requirements.",
              "Review the exact task packet and return compact JSON.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(packet, null, 2),
          },
        ],
      );
      return { status: "low-model-reviewed", packetPath, output: parseAdapterContent(content, { output_schema: { type: "object" } }) };
    } catch (error) {
      return { status: "low-model-review-error", packetPath, message: error.message };
    }
  }

  return { status: "unsupported-low-model-mode", mode: config.lowModel.mode, packetPath };
}

function buildShellDelegationPacket(workflowName, step, renderedCommands, context) {
  const inferredTaskClass = inferTaskClass(step);
  return {
    workflow: workflowName,
    step: step.id,
    type: step.type,
    task_class: inferredTaskClass,
    delegate: step.delegate ?? "not-delegable",
    commands: renderedCommands,
    constraints: [
      "Run or review only the exact command(s) supplied.",
      "Do not infer root cause.",
      "Do not edit files.",
      "Do not invent follow-up tasks.",
    ],
    context_keys: Object.keys(context).sort(),
  };
}

function inferTaskClass(step) {
  if (step.task_class) return step.task_class;
  if (step.command_ref && /search|rg|grep/i.test(step.command_ref)) return "search_exact";
  if (step.command_ref && /status|diff|changed|commit|log/i.test(step.command_ref)) return "diff_summary";
  if (step.delegate === "allowed") return "shell_exact";
  return null;
}

async function runWorkflow(spec, workflowName, options) {
  const workflow = spec.workflows[workflowName];
  if (!workflow) throw new Error(`Unknown workflow: ${workflowName}`);
  validateInputs(workflowName, workflow, options.inputs);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(__dirname, ".workflow-runs", `${workflowName}-${runId}`);
  await mkdir(runDir, { recursive: true });
  const config = adapterConfig();

  const context = {
    ...options.inputs,
    symptom_keywords: keywordRegex(options.inputs.symptom),
  };
  const stepResults = [];

  for (const step of workflow.steps ?? []) {
    const status = shouldRun(step, context) ? "running" : "skipped";
    if (status === "skipped") {
      stepResults.push({ id: step.id, type: step.type, status });
      continue;
    }

    if (step.type === "shell") {
      const commands = step.commands ?? [commandForStep(workflow, step, context)];
      const renderedCommands = commands.filter(Boolean).map((command) => interpolate(command, context));
      let delegation = null;
      if (step.delegate === "allowed" || step.task_class) {
        const packet = buildShellDelegationPacket(workflowName, step, renderedCommands, context);
        const packetPath = await writeDelegationPacket(runDir, step, packet);
        delegation = await runLowModelDelegation(packet, packetPath, config, options.cwd, options.dryRun);
      }
      const results = [];
      for (const rendered of renderedCommands) {
        const result = options.dryRun
          ? { command: rendered, exitCode: null, stdout: "", stderr: "", dryRun: true }
          : await runShell(rendered, options.cwd);
        results.push(result);
      }
      const value = results.length === 1 ? `${results[0].stdout}${results[0].stderr}` : results;
      context[outputKey(step)] = value;
      stepResults.push({ id: step.id, type: step.type, status: "completed", delegation, results });
      continue;
    }

    if (step.type === "ai") {
      const result = await runAiStep(workflowName, step, context, runDir, config);
      context[outputKey(step)] = result.output;
      context[step.id] = result.output;
      stepResults.push({ id: step.id, type: step.type, status: result.status, promptPath: result.promptPath, output: result.output });
      continue;
    }

    if (step.type === "file") {
      const files = normalizeFileList(getPath(context, step.input) ?? step.input);
      const contents = [];
      for (const file of files) {
        try {
          const fullPath = path.resolve(options.cwd, file);
          contents.push({ file: fullPath, content: await readFile(fullPath, "utf8") });
        } catch (error) {
          contents.push({ file, error: error.message });
        }
      }
      context[outputKey(step)] = contents;
      stepResults.push({ id: step.id, type: step.type, status: "completed", files: files.length });
      continue;
    }

    context[outputKey(step)] = {
      status: "manual-step",
      message: `${step.type} requires a host-specific adapter.`,
      action: step.action ?? step.strategy ?? step.constraints ?? null,
    };
    if (step.type === "code-edit" || step.blocks_downstream === true) {
      const blocked = {
        step: step.id,
        type: step.type,
        reason: "manual step must be completed before downstream steps run",
        next_action: "Complete this step in the lead agent, then run verification manually or rerun the workflow after recording its output.",
      };
      context.workflow_blocked = blocked;
      stepResults.push({ id: step.id, type: step.type, status: "manual-blocked", blocked });
      break;
    }
    stepResults.push({ id: step.id, type: step.type, status: "manual-adapter-required" });
  }

  const report = { workflow: workflowName, runDir, dryRun: options.dryRun, adapters: config, stepResults, context };
  const reportPath = path.join(runDir, "run-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportPath };
}

function keywordRegex(text = "") {
  const words = extractKeywords(text, 16);
  return words.length > 0 ? words.map(escapeRegex).join("|") : ".";
}

function extractKeywordsFromParts(parts = [], perPartLimit = 18, totalLimit = 30) {
  return uniqueByNormalized(parts.flatMap((part) => extractKeywords(part ?? "", perPartLimit))).slice(0, totalLimit);
}

function extractKeywords(text = "", limit = 24) {
  const raw = String(text).normalize("NFKC");
  const tokens = [];

  for (const match of raw.matchAll(/[A-Za-z0-9_\-./]{2,}/g)) {
    tokens.push(match[0]);
  }

  for (const match of raw.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu)) {
    tokens.push(...cjkKeywordCandidates(match[0]).slice(0, 6));
  }

  return uniqueByNormalized(tokens)
    .filter((token) => token.length >= 2)
    .slice(0, limit);
}

function cjkKeywordCandidates(value) {
  if (value.length <= 4) return [value];

  const candidates = [];
  if (value.length <= 12) candidates.push(value);

  const maxGram = Math.min(4, value.length);
  for (let size = maxGram; size >= 2; size -= 1) {
    for (let index = 0; index <= value.length - size; index += 1) {
      candidates.push(value.slice(index, index + size));
    }
  }
  return candidates;
}

function uniqueByNormalized(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const token = String(value).trim();
    const key = token.toLocaleLowerCase();
    if (!token || seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFileList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [String(value)];
}

function printPlan(spec, workflowName) {
  const workflow = spec.workflows[workflowName];
  if (!workflow) throw new Error(`Unknown workflow: ${workflowName}`);
  console.log(`# ${workflowName}`);
  console.log(workflow.description ?? "");
  console.log("");
  for (const [index, step] of (workflow.steps ?? []).entries()) {
    const when = step.when ? ` when: ${step.when}` : "";
    const taskClass = step.task_class ? ` task_class: ${step.task_class}` : "";
    console.log(`${index + 1}. ${step.id} [${step.type}]${taskClass}${when}`);
  }
}

async function printRunners(spec, cwd) {
  const registry = spec.delegation_policy?.runner_registry ?? {};
  for (const [name, runner] of Object.entries(registry)) {
    const probe = runner.availability_probe ?? "unspecified";
    let status = "unknown";
    if (probe === "current session" || probe === "adapter-managed") {
      status = probe;
    } else {
      const result = await runShell(probe, cwd);
      status = result.exitCode === 0 ? "available" : "unavailable";
    }
    const taskClasses = (runner.intended_task_classes ?? []).join(", ");
    console.log(`${name}\t${runner.display_name ?? name}\t${status}\t${probe}\t${taskClasses}`);
  }
}

function printAdapters() {
  const config = adapterConfig();
  const redacted = {
    ai: { ...config.ai, apiKey: config.ai.apiKey ? "<set>" : "" },
    lowModel: { ...config.lowModel, apiKey: config.lowModel.apiKey ? "<set>" : "" },
  };
  console.log(JSON.stringify(redacted, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const spec = await loadSpec(options.spec);

  if (options.command === "help") {
    console.log(usage(options.spec));
    return;
  }

  if (options.command === "validate") {
    console.log(`OK: ${Object.keys(spec.workflows).length} workflow(s) loaded from ${options.spec}`);
    return;
  }

  if (options.command === "list") {
    for (const [name, workflow] of Object.entries(spec.workflows)) {
      console.log(`${name}\t${workflow.description ?? ""}`);
    }
    return;
  }

  if (options.command === "runners") {
    await printRunners(spec, options.cwd);
    return;
  }

  if (options.command === "adapters") {
    printAdapters();
    return;
  }

  if (!options.workflowName) throw new Error(`${options.command} requires a workflow name`);

  if (options.command === "plan") {
    printPlan(spec, options.workflowName);
    return;
  }

  if (options.command === "run") {
    const result = await runWorkflow(spec, options.workflowName, options);
    console.log(`Workflow: ${result.workflow}`);
    console.log(`Run dir: ${result.runDir}`);
    console.log(`Report: ${result.reportPath}`);
    for (const step of result.stepResults) {
      console.log(`- ${step.id}: ${step.status}`);
    }
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error(error.message);
  console.error("");
  console.error(usage());
  process.exitCode = 1;
});
