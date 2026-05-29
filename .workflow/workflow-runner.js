#!/usr/bin/env node
import { exec, execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPEC = path.join(__dirname, "workflow.yaml");
const LOCAL_CONFIG = path.join(__dirname, "config.local.json");
const WIZARD_VERSION = "workflow-v0.3.11";
const PROJECT_ROOT = path.resolve(__dirname, "..");

const WIZARD_WORKFLOW_LABELS = {
  "github-issue-fix": "修 GitHub issue",
  "pr-review": "審查 PR / 分支差異",
  "bug-scan": "追查 bug",
  "feature-dev": "開發功能",
};

const WIZARD_STEP_LABELS = {
  "clarify-feature": "釐清這次要做的功能範圍",
  "collect-issue": "取得 GitHub issue 內容",
  "collect-status": "檢查目前 Git 狀態",
  "summarize-issue": "整理 issue 目標",
  "search-related-code": "搜尋相關程式碼",
  "search-existing-code": "搜尋既有程式碼",
  "memory-search": "查專案記憶與踩雷紀錄",
  "impact-before-edit": "分析修改影響範圍",
  "implementation-plan": "整理實作計畫",
  "design-plan": "整理設計與實作計畫",
  "fix": "修改程式",
  "implement": "實作功能",
  "verify": "執行 build / 驗證",
  "detect-changes": "檢查這次變更影響",
  "adjacent-regression-review": "檢查相鄰功能有沒有被影響",
  "closeout-checklist": "收尾檢查",
  "collect-diff": "收集差異內容",
  "collect-changed-files": "收集變更檔案",
  "classify-change": "判斷變更類型",
  "collect-impact": "收集影響資訊",
  "check-api-contracts": "檢查 API 契約",
  "check-ui-regressions": "檢查 UI 回歸風險",
  "check-tests": "檢查測試風險",
  "final-review": "整理最終審查",
  "explain-symptom": "說明 bug 現象",
  "search-error": "搜尋錯誤訊息",
  "trace-data-flow": "追蹤資料流程",
  "read-focused-files": "讀取重點檔案",
  "diagnose": "判斷可能根因",
  "probe-before-third-fix": "補證據或探針",
  "final-bug-report": "整理 bug 結論",
  adjacent_regression_review: "相鄰回歸檢查結果",
};

function parseArgs(argv) {
  const [command = "help", ...tokens] = argv;
  const wizardCommand = command === "wizard" ? tokens.shift() : null;
  const workflowName = command === "wizard" && wizardCommand !== "start" ? null : tokens.shift();
  const options = {
    command,
    wizardCommand,
    workflowName,
    run: null,
    artifacts: {},
    completeSteps: [],
    lowModelStatus: null,
    inputs: {},
    spec: DEFAULT_SPEC,
    cwd: path.resolve(__dirname, '..'),
    dryRun: false,
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--input" || token === "-i") {
      const pair = tokens[++i];
      const eq = pair?.indexOf("=") ?? -1;
      if (!pair || eq === -1) throw new Error("--input must use key=value");
      options.inputs[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (token === "--spec") {
      options.spec = path.resolve(tokens[++i]);
    } else if (token === "--cwd") {
      options.cwd = path.resolve(tokens[++i]);
    } else if (token === "--dry-run") {
      options.dryRun = true;
    } else if (token === "--attempt-count") {
      options.inputs.attempt_count = Number(tokens[++i]);
    } else if (token === "--run") {
      options.run = tokens[++i];
    } else if (token === "--artifact") {
      const pair = tokens[++i];
      const eq = pair?.indexOf("=") ?? -1;
      if (!pair || eq === -1) throw new Error("--artifact must use key=path");
      options.artifacts[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (token === "--complete-step") {
      options.completeSteps.push(tokens[++i]);
    } else if (token === "--resolve-low-model") {
      options.lowModelStatus = tokens[++i];
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function adapterConfig(env = process.env, localConfig = loadLocalConfig()) {
  const profile = localConfig.profile ?? "unset";
  const aiAdapter = configValue(env, localConfig, "WORKFLOW_AI_ADAPTER", "placeholder");
  const lowModelMode = configValue(env, localConfig, "WORKFLOW_LOW_MODEL_MODE", "record");
  const ollamaBaseUrl = configValue(env, localConfig, "WORKFLOW_OLLAMA_BASE_URL", "http://localhost:11434/v1");
  const hermesPath = configValue(env, localConfig, "WORKFLOW_HERMES_PATH", "C:\\Users\\ml042\\Projects\\Hermes-Agent\\venv\\Scripts\\hermes.exe");
  return {
    profile,
    configPath: existsSync(LOCAL_CONFIG) ? LOCAL_CONFIG : null,
    ai: {
      adapter: aiAdapter,
      baseUrl: configValue(env, localConfig, "WORKFLOW_AI_BASE_URL", aiAdapter === "ollama" ? ollamaBaseUrl : "https://api.openai.com/v1"),
      model: configValue(env, localConfig, "WORKFLOW_AI_MODEL", aiAdapter === "ollama" ? "llama3.1" : ""),
      apiKey: configValue(env, localConfig, "WORKFLOW_AI_API_KEY", ""),
      timeoutMs: Number(configValue(env, localConfig, "WORKFLOW_AI_TIMEOUT_MS", 30000)),
      maxTokens: Number(configValue(env, localConfig, "WORKFLOW_AI_MAX_TOKENS", 800)),
    },
    lowModel: {
      mode: lowModelMode,
      baseUrl: configValue(env, localConfig, "WORKFLOW_LOW_MODEL_BASE_URL", ollamaBaseUrl),
      model: configValue(env, localConfig, "WORKFLOW_LOW_MODEL", configValue(env, localConfig, "WORKFLOW_OLLAMA_MODEL", "llama3.1")),
      apiKey: configValue(env, localConfig, "WORKFLOW_LOW_MODEL_API_KEY", ""),
      command: configValue(env, localConfig, "WORKFLOW_LOW_MODEL_COMMAND", ""),
      handoffRequired: configValue(env, localConfig, "WORKFLOW_LOW_MODEL_HANDOFF_REQUIRED", "0") === "1",
      hermesPath,
      smallProvider: configValue(env, localConfig, "WORKFLOW_HERMES_SMALL_PROVIDER", "ollama-nemotron-3-super-cloud"),
      smallModel: configValue(env, localConfig, "WORKFLOW_HERMES_SMALL_MODEL", "nemotron-3-super:cloud"),
      fallbackProvider: configValue(env, localConfig, "WORKFLOW_HERMES_FALLBACK_PROVIDER", "github-copilot"),
      fallbackModel: configValue(env, localConfig, "WORKFLOW_HERMES_FALLBACK_MODEL", "gpt-5-mini"),
      delegateInDryRun: configValue(env, localConfig, "WORKFLOW_DELEGATE_IN_DRY_RUN", "0") === "1",
      timeoutMs: Number(configValue(env, localConfig, "WORKFLOW_LOW_MODEL_TIMEOUT_MS", 20000)),
      maxTokens: Number(configValue(env, localConfig, "WORKFLOW_LOW_MODEL_MAX_TOKENS", 400)),
    },
  };
}

function loadLocalConfig() {
  if (!existsSync(LOCAL_CONFIG)) return {};
  try {
    return JSON.parse(readFileSync(LOCAL_CONFIG, "utf8"));
  } catch (error) {
    return {
      profile: "invalid",
      env: {},
      error: error.message,
    };
  }
}

function configValue(env, localConfig, key, fallback) {
  if (env[key] !== undefined) return env[key];
  if (localConfig?.env?.[key] !== undefined) return localConfig.env[key];
  return fallback;
}

function firstUseProfiles() {
  return {
    "external-free": {
      label: "外部免費模型 / Hermes 小N優先",
      description: "用 Hermes 當外部 worker；有 Ollama 就走小N，沒有就 fallback 小G。適合想省主模型 token、把搜尋/測試/log 摘要分出去。",
      env: {
        WORKFLOW_AI_ADAPTER: "placeholder",
        WORKFLOW_LOW_MODEL_MODE: "hermes",
        WORKFLOW_DELEGATE_IN_DRY_RUN: "0",
      },
    },
    "lead-low-model": {
      label: "Lead 手動路由低模型 / 不外呼",
      description: "不呼叫 Hermes；只產生 low-model packet，Lead 必須明確交給可用低模型。若未完成低模型 handoff，不能宣稱已委派。",
      env: {
        WORKFLOW_AI_ADAPTER: "placeholder",
        WORKFLOW_LOW_MODEL_MODE: "record",
        WORKFLOW_LOW_MODEL_HANDOFF_REQUIRED: "1",
        WORKFLOW_DELEGATE_IN_DRY_RUN: "0",
      },
    },
  };
}

async function writeFirstUseConfig(profileName) {
  const profiles = firstUseProfiles();
  const profile = profiles[profileName];
  if (!profile) {
    throw new Error(`Unknown setup profile: ${profileName}. Use: ${Object.keys(profiles).join(", ")}`);
  }
  const config = {
    setupVersion: 1,
    profile: profileName,
    label: profile.label,
    description: profile.description,
    env: profile.env,
    createdAt: new Date().toISOString(),
  };
  await writeFile(LOCAL_CONFIG, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

async function setupFirstUse(profileName) {
  const profiles = firstUseProfiles();
  let selected = profileName;

  if (!selected) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log("第一次使用 workflow，請選擇低模型策略：");
      console.log("1. external-free  - 外部免費模型 / Hermes 小N優先");
      console.log("2. lead-low-model - Lead 手動路由低模型 / 不外呼");
      const answer = (await rl.question("請輸入 1 或 2：")).trim();
      selected = answer === "1" ? "external-free" : answer === "2" ? "lead-low-model" : answer;
    } finally {
      rl.close();
    }
  }

  const config = await writeFirstUseConfig(selected);
  console.log(`Setup saved: ${LOCAL_CONFIG}`);
  console.log(`${config.profile}: ${config.label}`);
  console.log(config.description);
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
    "  node workflow-runner.js setup [external-free|lead-low-model]",
    "  node workflow-runner.js list [--spec workflow.yaml]",
    "  node workflow-runner.js adapters [--spec workflow.yaml]",
    "  node workflow-runner.js plan <workflow> --input key=value ...",
    "  node workflow-runner.js wizard start <workflow> --input key=value ...",
    "  node workflow-runner.js wizard status --run <run-id-or-path>",
    "  node workflow-runner.js wizard resume --run <run-id-or-path> [--complete-step step] [--artifact key=path]",
    "  node workflow-runner.js validate [--spec workflow.yaml]",
    "",
    "Examples:",
    "  node workflow-runner.js setup external-free",
    "  node workflow-runner.js setup lead-low-model",
    "  node workflow-runner.js list",
    "  node workflow-runner.js adapters",
    "  node workflow-runner.js plan pr-review -i base_ref=main -i target_ref=HEAD",
    "  node workflow-runner.js wizard start github-issue-fix -i issue_number=63 -i repo=ml0427/Custom-tag-preview-software",
    "  node workflow-runner.js wizard resume --run github-issue-fix-2026-05-29T00-00-00-000Z --artifact issue_json=.workflow-runs/github-issue-fix-2026-05-29T00-00-00-000Z/collect-issue.json",
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
    if (config.lowModel.handoffRequired) {
      return {
        status: "low-model-handoff-required",
        packetPath,
        message: "Packet recorded. Lead must explicitly hand this packet to a low model before counting delegation as complete.",
      };
    }
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

function wizardRunsRoot() {
  return path.join(__dirname, ".workflow-runs");
}

function createRunId(workflowName) {
  return `${workflowName}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function wizardStatePath(runDir) {
  return path.join(runDir, "wizard-state.json");
}

function resolveRunDir(runRef) {
  if (!runRef) throw new Error("wizard command requires --run");
  if (path.isAbsolute(runRef)) return runRef;
  if (runRef.includes("/") || runRef.includes("\\")) return path.resolve(process.cwd(), runRef);
  return path.join(wizardRunsRoot(), runRef);
}

async function readWizardState(runRef) {
  const runDir = resolveRunDir(runRef);
  const statePath = wizardStatePath(runDir);
  const raw = await readFile(statePath, "utf8");
  return { state: JSON.parse(raw), runDir, statePath };
}

async function writeWizardState(state) {
  state.updated_at = new Date().toISOString();
  await mkdir(state.runDir, { recursive: true });
  await writeFile(wizardStatePath(state.runDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function createWizardContext(inputs = {}) {
  return {
    ...inputs,
    symptom_keywords: keywordRegex(inputs.symptom),
  };
}

function buildRequiredArtifacts(workflow) {
  const artifacts = {};
  for (const step of workflow.steps ?? []) {
    artifacts[outputKey(step)] = null;
  }
  const hasAdjacentReviewStep = (workflow.steps ?? []).some((step) => step.id === "adjacent-regression-review");
  if (!hasAdjacentReviewStep && (workflow.steps ?? []).some((step) => /closeout/i.test(step.id))) {
    artifacts.adjacent_regression_review = null;
  }
  return artifacts;
}

function lowModelWizardState(config) {
  const handoffRequired = process.env.WORKFLOW_LOW_MODEL_HANDOFF_REQUIRED === "1";
  return {
    mode: config.lowModel.mode,
    handoff_required: handoffRequired,
    pending_packet: null,
    handoff_status: handoffRequired ? "not-started" : "not-required",
  };
}

function findNextWizardStep(workflow, state) {
  const completed = new Set(state.completed_steps ?? []);
  const skipped = new Set(state.skipped_steps ?? []);
  const context = { ...state.context };

  for (const step of workflow.steps ?? []) {
    if (completed.has(step.id) || skipped.has(step.id)) continue;
    if (!shouldRun(step, context)) {
      skipped.add(step.id);
      const key = outputKey(step);
      if (state.required_artifacts?.[key] === null) state.required_artifacts[key] = "(skipped)";
      continue;
    }
    state.skipped_steps = [...skipped];
    return step;
  }

  state.skipped_steps = [...skipped];
  return null;
}

function commandTextForStep(workflow, step, context) {
  const commands = step.commands ?? [commandForStep(workflow, step, context)];
  return commands.filter(Boolean).map((command) => interpolate(command, context));
}

function wizardWorkflowLabel(workflowName) {
  return WIZARD_WORKFLOW_LABELS[workflowName] ?? workflowName;
}

function wizardStepLabel(stepId) {
  return WIZARD_STEP_LABELS[stepId] ?? stepId;
}

function wizardStepById(state, stepId) {
  return (state.steps ?? []).find((step) => step.id === stepId) ?? null;
}

function workflowStepByArtifact(workflow, artifactKey) {
  return (workflow.steps ?? []).find((step) => outputKey(step) === artifactKey || step.id === artifactKey) ?? null;
}

function wizardArtifactLabel(state, artifactKey) {
  const step = (state.steps ?? []).find((candidate) => candidate.output === artifactKey || candidate.id === artifactKey);
  return step ? wizardStepLabel(step.id) : wizardStepLabel(artifactKey);
}

function wizardProgress(state) {
  const steps = state.steps ?? [];
  const completed = new Set(state.completed_steps ?? []);
  const skipped = new Set(state.skipped_steps ?? []);
  const done = steps.filter((step) => completed.has(step.id) || skipped.has(step.id)).length;
  const currentIndex = steps.findIndex((step) => step.id === state.current_step);
  return {
    done,
    total: steps.length,
    currentNumber: currentIndex >= 0 ? currentIndex + 1 : steps.length,
  };
}

function wizardBlockedText(step) {
  if (!step) return "所有步驟都已完成。";
  if (step.type === "code-edit" || step.blocks_downstream === true) {
    return "目前停在人工修改關卡，必須真的完成這一步，工作流管家才會往下走。";
  }
  if (step.type === "shell") {
    return "目前需要收集命令輸出或查詢結果，交回結果檔後才會進下一步。";
  }
  if (step.type === "ai") {
    return "目前需要 AI 產出一份分析或計畫，交回結果檔後才會進下一步。";
  }
  return "目前需要完成這個工具/人工關卡，交回結果或標記完成後才會進下一步。";
}

function wizardArtifactExtension(step) {
  if (step.output_schema?.type === "object") return "json";
  if (step.output_format === "markdown" || step.type === "ai" || step.type === "code-edit") return "md";
  return "txt";
}

function wizardArtifactFileName(step) {
  const key = outputKey(step).replace(/[^A-Za-z0-9_-]+/g, "-");
  return `${key}.${wizardArtifactExtension(step)}`;
}

function wizardSuggestedArtifactPath(state, step) {
  return path
    .relative(PROJECT_ROOT, path.join(state.runDir, wizardArtifactFileName(step)))
    .replaceAll("/", "\\");
}

function wizardResumeCommand(state, step) {
  return `node .workflow/workflow-runner.js wizard resume --run ${state.run_id} --artifact ${outputKey(step)}=${wizardSuggestedArtifactPath(state, step)}`;
}

function schemaExampleValue(field, schema = {}) {
  if (schema.allowed_values) return schema.allowed_values.join(" | ");
  if (field === "confidence") return "low | medium | high";
  if (field === "status") return "pass | blocked";
  if (
    schema.type === "array" ||
    /(?:^|_)(?:areas|breakpoints|checks|changes|features|files|findings|flow|goals|items|questions|risks|steps|subtasks)(?:_|$)/i.test(field) ||
    /s$/i.test(field)
  ) return [];
  if (schema.type === "boolean" || /^is_|_needed$/i.test(field)) return false;
  if (schema.type === "number" || schema.type === "integer" || /count|total|index/i.test(field)) return 0;
  return "TODO";
}

function wizardSchemaExample(step) {
  const required = step.output_schema?.required ?? [];
  const properties = step.output_schema?.properties ?? {};
  return Object.fromEntries(required.map((field) => [field, schemaExampleValue(field, properties[field])]));
}

function wizardFormatInstructions(step, state) {
  const artifactPath = wizardSuggestedArtifactPath(state, step);
  const resumeCommand = wizardResumeCommand(state, step);

  if (step.output_schema?.type === "object") {
    const required = step.output_schema.required ?? [];
    return [
      "",
      "請建立這個結果檔：",
      `  ${artifactPath}`,
      "",
      "內容必須是 JSON object。必要欄位：",
      ...required.map((field) => `  - ${field}`),
      "",
      "最小範例：",
      "```json",
      JSON.stringify(wizardSchemaExample(step), null, 2),
      "```",
      "",
      "完成後執行：",
      `  ${resumeCommand}`,
    ].join("\n");
  }

  if (step.type === "shell") {
    return [
      "",
      "請把完整命令輸出存到：",
      `  ${artifactPath}`,
      "",
      "完成後執行：",
      `  ${resumeCommand}`,
    ].join("\n");
  }

  if (step.type === "code-edit" || step.blocks_downstream === true) {
    return [
      "",
      "完成實作後請建立這個結果檔：",
      `  ${artifactPath}`,
      "",
      "內容請用 Markdown，至少包含：",
      "  - 修改了哪些檔案",
      "  - 為什麼這樣改",
      "  - 需要跑哪些驗證",
      "",
      "完成後執行：",
      `  ${resumeCommand}`,
    ].join("\n");
  }

  return [
    "",
    "請把這一步的結果存到：",
    `  ${artifactPath}`,
    "",
    "完成後執行：",
    `  ${resumeCommand}`,
  ].join("\n");
}

function wizardPromptForStep(workflow, step, state) {
  if (!step) return "流程已完成。請確認收尾檢查、最後 Git 狀態與必要紀錄。";

  const label = wizardStepLabel(step.id);
  const formatInstructions = wizardFormatInstructions(step, state);

  if (step.type === "shell") {
    const commands = commandTextForStep(workflow, step, state.context);
    const commandBlock = commands.length > 0 ? `\n\n要執行或收集的命令:\n${commands.map((command) => `  ${command}`).join("\n")}` : "";
    return `現在要做的是「${label}」。完成後，把結果存成指定檔案並交回工作流管家。${commandBlock}${formatInstructions}`;
  }

  if (step.type === "ai") {
    return `現在要做的是「${label}」。請依照指定格式產出結果檔，讓工作流管家可以檢查並放行。${formatInstructions}`;
  }

  if (step.type === "code-edit" || step.blocks_downstream === true) {
    return `現在要做的是「${label}」。這一步必須由 Lead AI 實際完成，完成後交回指定結果檔。${formatInstructions}`;
  }

  return `現在要做的是「${label}」。請依照這一步需要的工具或人工流程完成，然後交回指定結果檔或標記完成。${formatInstructions}`;
}

function updateWizardBlock(workflow, state) {
  const step = findNextWizardStep(workflow, state);
  state.current_step = step?.id ?? null;

  if (!step) {
    state.status = "completed";
    state.blocked_reason = null;
    state.next_question = "All workflow steps are complete. Confirm closeout artifacts and final git status.";
    return state;
  }

  state.status = "blocked";
  state.blocked_reason = step.type === "code-edit" || step.blocks_downstream === true
    ? `等待「${wizardStepLabel(step.id)}」完成`
    : `等待「${wizardStepLabel(step.id)}」的結果`;
  state.next_question = wizardPromptForStep(workflow, step, state);
  return state;
}

function validateStructuredArtifact(step, artifactPath) {
  if (step?.output_schema?.type !== "object") return null;

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch (error) {
    throw new Error(`Artifact for ${step.id} must be valid JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Artifact for ${step.id} must be a JSON object`);
  }

  const missing = (step.output_schema.required ?? []).filter((field) => !(field in parsed) || parsed[field] === undefined || parsed[field] === null);
  if (missing.length > 0) {
    throw new Error(`Artifact for ${step.id} is missing required field(s): ${missing.join(", ")}`);
  }

  return parsed;
}

function registerWizardArtifact(state, key, value, cwd, workflow) {
  const artifactPath = path.isAbsolute(value) ? value : path.resolve(cwd, value);
  if (!existsSync(artifactPath)) {
    throw new Error(`Artifact does not exist: ${artifactPath}`);
  }
  const step = workflowStepByArtifact(workflow, key);
  const structuredOutput = validateStructuredArtifact(step, artifactPath);
  state.required_artifacts[key] = artifactPath;
  state.context[key] = structuredOutput ?? artifactPath;
  if (structuredOutput) state.context[`${key}_artifact_path`] = artifactPath;
  state.history.push({
    step: state.current_step,
    status: "artifact-registered",
    artifact: key,
    path: artifactPath,
    schemaValidated: Boolean(structuredOutput),
    timestamp: new Date().toISOString(),
  });
}

function markWizardStepComplete(state, stepId) {
  if (!stepId) throw new Error("--complete-step requires a step id");
  if (!state.completed_steps.includes(stepId)) state.completed_steps.push(stepId);
  const step = (state.steps ?? []).find((candidate) => candidate.id === stepId);
  if (step && state.required_artifacts?.[step.output] === null) {
    state.required_artifacts[step.output] = "(completed manually)";
  }
  state.history.push({
    step: stepId,
    status: "completed",
    timestamp: new Date().toISOString(),
  });
}

function applyWizardResumeOptions(state, options, workflow) {
  for (const [key, value] of Object.entries(options.artifacts ?? {})) {
    registerWizardArtifact(state, key, value, options.cwd, workflow);
    const step = (state.steps ?? []).find((candidate) => candidate.output === key || candidate.id === key);
    if (step) markWizardStepComplete(state, step.id);
  }

  for (const stepId of options.completeSteps ?? []) {
    markWizardStepComplete(state, stepId);
  }

  if (options.lowModelStatus) {
    state.low_model.handoff_status = options.lowModelStatus;
    state.history.push({
      step: state.current_step,
      status: "low-model-resolved",
      resolution: options.lowModelStatus,
      timestamp: new Date().toISOString(),
    });
  }
}

async function wizardStart(spec, workflowName, options) {
  const workflow = spec.workflows[workflowName];
  if (!workflow) throw new Error(`Unknown workflow: ${workflowName}`);
  validateInputs(workflowName, workflow, options.inputs);

  const runId = createRunId(workflowName);
  const runDir = path.join(wizardRunsRoot(), runId);
  const config = adapterConfig();
  const state = {
    workflow: workflowName,
    version: WIZARD_VERSION,
    status: "blocked",
    run_id: runId,
    runDir,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    inputs: options.inputs,
    context: createWizardContext(options.inputs),
    current_step: null,
    completed_steps: [],
    skipped_steps: [],
    required_artifacts: buildRequiredArtifacts(workflow),
    low_model: lowModelWizardState(config),
    blocked_reason: null,
    next_question: null,
    steps: (workflow.steps ?? []).map((step) => ({ id: step.id, type: step.type, output: outputKey(step) })),
    history: [],
  };

  updateWizardBlock(workflow, state);
  await writeWizardState(state);
  return { state, statePath: wizardStatePath(runDir) };
}

async function wizardStatus(options) {
  const result = await readWizardState(options.run);
  return result;
}

async function wizardResume(spec, options) {
  const { state, runDir, statePath } = await readWizardState(options.run);
  const workflow = spec.workflows[state.workflow];
  if (!workflow) throw new Error(`Unknown workflow in state: ${state.workflow}`);

  state.runDir = runDir;
  applyWizardResumeOptions(state, options, workflow);
  updateWizardBlock(workflow, state);
  await writeWizardState(state);
  return { state, runDir, statePath };
}

function printWizardState(state, statePath) {
  const progress = wizardProgress(state);
  const currentStep = state.current_step ? wizardStepById(state, state.current_step) : null;
  const currentLabel = state.current_step ? wizardStepLabel(state.current_step) : "沒有下一步";

  console.log(`工作流管家：${wizardWorkflowLabel(state.workflow)}`);
  console.log(`目前進度：第 ${progress.currentNumber}/${progress.total} 步，已完成 ${progress.done} 步`);
  console.log(`現在卡在：${currentLabel}`);
  console.log(`狀態：${state.status === "completed" ? "已完成" : "等待下一個結果"}`);
  if (state.blocked_reason) console.log(`卡住原因：${state.blocked_reason}`);
  console.log(`白話說明：${wizardBlockedText(currentStep)}`);

  if (state.next_question) {
    console.log("");
    console.log("下一步：");
    console.log(state.next_question);
  }

  const missing = Object.entries(state.required_artifacts ?? {})
    .filter(([, value]) => !value)
    .map(([key]) => wizardArtifactLabel(state, key));
  if (missing.length > 0) {
    console.log("");
    console.log(`還缺的結果：${missing.join(", ")}`);
  }

  if (state.low_model?.handoff_required) {
    console.log("");
    console.log(`低模型交接狀態：${state.low_model.handoff_status}`);
  }

  console.log("");
  console.log("技術資訊：");
  console.log(`- workflow: ${state.workflow}`);
  console.log(`- run id: ${state.run_id}`);
  console.log(`- state: ${statePath}`);
  console.log(`- current step: ${state.current_step ?? "(none)"}`);
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

  if (options.command === "setup") {
    await setupFirstUse(options.workflowName);
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

  if (options.command === "wizard") {
    if (options.wizardCommand === "start") {
      if (!options.workflowName) throw new Error("wizard start requires a workflow name");
      const result = await wizardStart(spec, options.workflowName, options);
      printWizardState(result.state, result.statePath);
      return;
    }

    if (options.wizardCommand === "status") {
      const result = await wizardStatus(options);
      printWizardState(result.state, result.statePath);
      return;
    }

    if (options.wizardCommand === "resume") {
      const result = await wizardResume(spec, options);
      printWizardState(result.state, result.statePath);
      return;
    }

    throw new Error("wizard requires one of: start, status, resume");
  }

  if (!options.workflowName) throw new Error(`${options.command} requires a workflow name`);

  if (options.command === "plan") {
    printPlan(spec, options.workflowName);
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
