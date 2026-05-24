#!/usr/bin/env node
import { exec } from "node:child_process";
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
    cwd: process.cwd(),
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
    "  node workflow-runner.js plan <workflow> --input key=value ...",
    "  node workflow-runner.js run <workflow> --input key=value ... [--dry-run] [--cwd path]",
    "  node workflow-runner.js validate [--spec workflow.yaml]",
    "",
    "Examples:",
    "  node workflow-runner.js list",
    "  node workflow-runner.js runners",
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
  const keywords = [...new Set(`${symptom} ${error}`.match(/[A-Za-z0-9_\-./]+/g) ?? [])].slice(0, 8);
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
  const body = `${issue.title ?? ""}\n${issue.body ?? ""}\n${context.focus ?? ""}`;
  const words = [...new Set(body.match(/[A-Za-z0-9_\-/.#]+|[\u4e00-\u9fff]{2,}/g) ?? [])]
    .filter((word) => String(word).length >= 2)
    .slice(0, 12);
  return {
    plain_language_goal: issue.title ?? context.focus ?? "Issue goal requires adapter review",
    acceptance_checks: [
      "issue-relevant behavior changed",
      "project verification commands passed",
      "issue closeout completed when pushed",
    ],
    candidate_symbols: words.filter((word) => /[_./]|source|item|api|db/i.test(word)).slice(0, 8),
    labels,
    issue_keywords: words.length > 0 ? words.map(escapeRegex).join("|") : ".",
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

async function runWorkflow(spec, workflowName, options) {
  const workflow = spec.workflows[workflowName];
  if (!workflow) throw new Error(`Unknown workflow: ${workflowName}`);
  validateInputs(workflowName, workflow, options.inputs);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(options.cwd, ".workflow-runs", `${workflowName}-${runId}`);
  await mkdir(runDir, { recursive: true });

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
      const results = [];
      for (const command of commands.filter(Boolean)) {
        const rendered = interpolate(command, context);
        const result = options.dryRun
          ? { command: rendered, exitCode: null, stdout: "", stderr: "", dryRun: true }
          : await runShell(rendered, options.cwd);
        results.push(result);
      }
      const value = results.length === 1 ? `${results[0].stdout}${results[0].stderr}` : results;
      context[outputKey(step)] = value;
      stepResults.push({ id: step.id, type: step.type, status: "completed", results });
      continue;
    }

    if (step.type === "ai") {
      const prompt = buildPrompt(workflowName, step, context);
      const promptPath = path.join(runDir, `${step.id}.prompt.md`);
      await writeFile(promptPath, prompt, "utf8");
      const value = aiPlaceholder(step, context);
      context[outputKey(step)] = value;
      context[step.id] = value;
      stepResults.push({ id: step.id, type: step.type, status: "prompt-generated", promptPath, output: value });
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
    stepResults.push({ id: step.id, type: step.type, status: "manual-adapter-required" });
  }

  const report = { workflow: workflowName, runDir, dryRun: options.dryRun, stepResults, context };
  const reportPath = path.join(runDir, "run-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportPath };
}

function keywordRegex(text = "") {
  const words = [...new Set(String(text).match(/[A-Za-z0-9_\-./]+/g) ?? [])].slice(0, 8);
  return words.length > 0 ? words.map(escapeRegex).join("|") : ".";
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
