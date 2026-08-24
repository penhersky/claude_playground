/**
 * The three routes to structured output — Task 4.3.
 *
 * | Route | Mechanism | Use when |
 * |---|---|---|
 * | `extract()` | `messages.parse()` + `output_config.format` | one known schema; the default |
 * | `extractViaAnyTool()` | `tool_choice: "any"` over several tools | document type unknown; let the model pick the schema |
 * | `extractMetadataForced()` | `tool_choice: {type:"tool",name:…}` | a specific extraction must run first, before enrichment |
 *
 * All three eliminate JSON syntax errors. None eliminates semantic ones —
 * that is `validate.ts`.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL } from "../../src/config/env.ts";
import { SYSTEM_PROMPT } from "./fewshot.ts";
import { ExtractionSchema, METADATA_TOOL_SCHEMA, type Extraction } from "./schema.ts";

export interface ExtractResult {
  extraction: Extraction;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/**
 * Primary route: structured output with a Zod schema.
 *
 * The system prompt is cached. It carries the normalization rules plus three
 * few-shot examples and is byte-identical on every request, while the document
 * varies — so the stable content goes first and the breakpoint sits after it.
 * Cache matching is prefix-based: any change before the breakpoint invalidates
 * everything after it.
 */
export async function extract(
  client: Anthropic,
  documentText: string,
  extraPrompt?: string,
): Promise<ExtractResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: extraPrompt ?? `Extract this document:\n\n---\n${documentText}\n---`,
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  });

  // `parsed_output` is null when parsing failed. Guard rather than assert:
  // treating a null as an extraction produces a confusing failure three
  // functions later.
  if (!response.parsed_output) {
    throw new Error(
      "Structured output did not parse. stop_reason=" +
        `${response.stop_reason}. This is rare with output_config.format and usually ` +
        "means the response was truncated — check max_tokens.",
    );
  }

  return {
    extraction: response.parsed_output,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  };
}

/**
 * `tool_choice: "any"` — the model must call a tool, but chooses which.
 *
 * The case Task 4.3 describes: several extraction schemas exist and the
 * document type is unknown up front. `"auto"` would let the model reply with
 * prose instead ("this looks like a statement of account, not an invoice"),
 * which is exactly the unstructured answer you were trying to prevent.
 */
export async function extractViaAnyTool(
  client: Anthropic,
  documentText: string,
): Promise<{ toolName: string; data: Record<string, unknown> }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Extract this document:\n\n---\n${documentText}\n---` }],
    tool_choice: { type: "any" },
    tools: [
      {
        name: "extract_invoice",
        description:
          "Extract a document that requests payment: an invoice, fee note, or bill. " +
          "Use this when the document names an amount the recipient owes.",
        strict: true,
        input_schema: {
          type: "object",
          properties: {
            vendor: { type: ["string", "null"] },
            invoiceNumber: { type: ["string", "null"] },
            statedTotalUsd: { type: ["number", "null"] },
            lineItemCount: { type: "integer" },
          },
          required: ["vendor", "invoiceNumber", "statedTotalUsd", "lineItemCount"],
          additionalProperties: false,
        },
      },
      {
        name: "extract_statement",
        description:
          "Extract an account statement: a periodic summary of balances and activity " +
          "that is NOT itself a request for payment. Use this when the document shows " +
          "an opening and closing balance rather than an amount due.",
        strict: true,
        input_schema: {
          type: "object",
          properties: {
            accountRef: { type: ["string", "null"] },
            periodStart: { type: ["string", "null"] },
            periodEnd: { type: ["string", "null"] },
            closingBalanceUsd: { type: ["number", "null"] },
          },
          required: ["accountRef", "periodStart", "periodEnd", "closingBalanceUsd"],
          additionalProperties: false,
        },
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    throw new Error(
      `tool_choice "any" guarantees a tool call, but stop_reason was ` +
        `${response.stop_reason} with no tool_use block.`,
    );
  }

  // Always parse tool inputs rather than string-matching the serialized form —
  // current models vary their JSON escaping (unicode, forward slashes).
  return { toolName: toolUse.name, data: toolUse.input as Record<string, unknown> };
}

/**
 * Forced tool selection — the model must call this specific tool.
 *
 * Task 2.3's pattern: guarantee `extract_metadata` runs before any enrichment
 * step, then process the rest in follow-up turns. Neither `"auto"` nor `"any"`
 * gives you ordering; only naming the tool does.
 */
export async function extractMetadataForced(
  client: Anthropic,
  documentText: string,
): Promise<Record<string, unknown>> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content: `Identify this document:\n\n---\n${documentText}\n---` },
    ],
    tool_choice: { type: "tool", name: "extract_metadata" },
    tools: [
      {
        name: "extract_metadata",
        description:
          "Identify a document's type and its top-level references. Always runs first, " +
          "before any field-level extraction, so downstream steps know what they are reading.",
        strict: true,
        input_schema: METADATA_TOOL_SCHEMA,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) throw new Error("Forced tool_choice did not produce a tool_use block.");
  return toolUse.input as Record<string, unknown>;
}
