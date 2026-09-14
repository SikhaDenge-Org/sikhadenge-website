import assert from "node:assert/strict";

import type { EmailTemplateDocument } from "../templates/blocks";
import { renderEmailTemplate } from "../templates/render";
import { assertEmailTemplateDocument } from "../templates/validation";

function document(overrides: Partial<EmailTemplateDocument> = {}): EmailTemplateDocument {
  return {
    subject: "Welcome {{firstName}} to {{course}}",
    preheader: "Your {{course}} learning plan is ready.",
    variables: [
      { key: "firstName", label: "First name", required: true },
      { key: "course", label: "Course", required: false, fallback: "AI Expert" },
    ],
    blocks: [
      { id: "heading", type: "HEADING", level: 1, text: "Welcome {{firstName}}", align: "CENTER" },
      { id: "text", type: "TEXT", text: "You are enrolled in {{course}}.\nWe are ready to help." },
      { id: "image", type: "IMAGE", src: "https://sikhadenge.in/email/welcome.png", alt: "SikhaDenge welcome", width: 640 },
      { id: "button", type: "BUTTON", label: "Open learning dashboard", url: "https://sikhadenge.in/learn", align: "CENTER" },
      { id: "divider", type: "DIVIDER", color: "#E5E7EB", thickness: 1 },
      { id: "spacer", type: "SPACER", height: 24 },
    ],
    ...overrides,
  };
}

function testAllStudioBlocksRender() {
  const rendered = renderEmailTemplate({
    document: document(),
    values: { firstName: "Ankit" },
  });

  assert.equal(rendered.subject, "Welcome Ankit to AI Expert");
  assert.equal(rendered.preheader, "Your AI Expert learning plan is ready.");
  assert.equal(rendered.variables.firstName, "Ankit");
  assert.equal(rendered.variables.course, "AI Expert");
  assert.match(rendered.html, /<h1/);
  assert.match(rendered.html, /<img/);
  assert.match(rendered.html, /Open learning dashboard/);
  assert.match(rendered.html, /border-top:1px solid #E5E7EB/);
  assert.match(rendered.html, /height:24px/);
  assert.match(rendered.text, /Welcome Ankit/);
  assert.match(rendered.text, /Open learning dashboard: https:\/\/sikhadenge\.in\/learn/);
}

function testHtmlEscapesVariableValues() {
  const rendered = renderEmailTemplate({
    document: document(),
    values: { firstName: "<script>alert('x')</script>" },
  });

  assert.doesNotMatch(rendered.html, /<script>/i);
  assert.match(rendered.html, /&lt;script&gt;/i);
}

function testRequiredVariablesFailClosed() {
  assert.throws(
    () => renderEmailTemplate({ document: document() }),
    /required email template variable firstname is missing/i,
  );
}

function testUndeclaredVariablesFailClosed() {
  const invalid = document({
    subject: "Hello {{unknown}}",
  });
  assert.throws(
    () => assertEmailTemplateDocument(invalid),
    /token {{unknown}} is not declared/i,
  );
}

function testUnsafeLinksFailClosed() {
  const invalid = document({
    blocks: [
      { id: "bad-button", type: "BUTTON", label: "Open", url: "javascript:alert(1)" },
    ],
  });
  assert.throws(
    () => assertEmailTemplateDocument(invalid),
    /protocol javascript: is not allowed/i,
  );
}

function testDuplicateBlockIdsFailClosed() {
  const invalid = document({
    blocks: [
      { id: "same", type: "TEXT", text: "One" },
      { id: "same", type: "TEXT", text: "Two" },
    ],
  });
  assert.throws(
    () => assertEmailTemplateDocument(invalid),
    /duplicate email template block id/i,
  );
}

function testTemplateUrlsCanUseDeclaredVariables() {
  const dynamic = document({
    variables: [
      { key: "firstName", label: "First name", required: true },
      { key: "course", label: "Course", required: false, fallback: "AI Expert" },
      { key: "destination", label: "Destination", required: true },
    ],
    blocks: [
      { id: "cta", type: "BUTTON", label: "Continue {{firstName}}", url: "{{destination}}" },
    ],
  });
  const rendered = renderEmailTemplate({
    document: dynamic,
    values: {
      firstName: "Ankit",
      destination: "https://sikhadenge.in/admission",
    },
  });
  assert.match(rendered.html, /https:\/\/sikhadenge\.in\/admission/);

  assert.throws(
    () =>
      renderEmailTemplate({
        document: dynamic,
        values: {
          firstName: "Ankit",
          destination: "javascript:alert(1)",
        },
      }),
    /protocol javascript: is not allowed/i,
  );
}

testAllStudioBlocksRender();
testHtmlEscapesVariableValues();
testRequiredVariablesFailClosed();
testUndeclaredVariablesFailClosed();
testUnsafeLinksFailClosed();
testDuplicateBlockIdsFailClosed();
testTemplateUrlsCanUseDeclaredVariables();

console.log("Email automation E2 template studio contracts: PASS");
