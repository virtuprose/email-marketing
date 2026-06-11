import { EmailDesignValidationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  VIRTUPROSE_SIGNATURE_PREMIUM_HTML,
  prepareEmailDesignHtml,
  renderCustomEmailHtml
} from "./email-designs";

const validHtml = `<!doctype html>
<html>
  <head>
    <style>
      .button { background: #00aeb7; color: #ffffff; padding: 12px 18px; }
      @media only screen and (max-width: 600px) { .container { width: 100% !important; } }
    </style>
    <title>{{preheader}}</title>
  </head>
  <body>
    <table role="presentation" class="container" width="600">
      <tr>
        <td>
          <p>Hello {{first_name}},</p>
          {{body_html}}
          <a class="button" href="{{unsubscribe_url}}">Unsubscribe</a>
        </td>
      </tr>
    </table>
  </body>
</html>`;

describe("email design templates", () => {
  it("inlines and accepts a safe template", () => {
    const prepared = prepareEmailDesignHtml(validHtml);

    expect(prepared.status).toBe(EmailDesignValidationStatus.VALID);
    expect(prepared.errors).toEqual([]);
    expect(prepared.sanitizedHtml).toContain("{{body_html}}");
    expect(prepared.sanitizedHtml).toContain("background: #00aeb7");
  });

  it("blocks scripts, forms, and missing body placeholder", () => {
    const prepared = prepareEmailDesignHtml(
      `<html><body><script>alert(1)</script><form></form><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>`
    );

    expect(prepared.status).toBe(EmailDesignValidationStatus.BLOCKED);
    expect(prepared.errors.join(" ")).toContain("script");
    expect(prepared.errors.join(" ")).toContain("forms");
    expect(prepared.errors.join(" ")).toContain("{{body_html}}");
  });

  it("renders personalization, injected body html, and unsubscribe link", () => {
    const prepared = prepareEmailDesignHtml(validHtml);
    const rendered = renderCustomEmailHtml({
      designHtml: prepared.sanitizedHtml,
      account: { fromName: "Virtuprose" },
      subject: "Quick idea",
      text: "Hi {{first_name}}\n\nBook here: https://virtuprose.com",
      lead: {
        firstName: "Sara",
        company: "Growth Studio",
        email: "sara@example.com"
      },
      unsubscribeUrl: "https://sales.virtuprose.com/unsubscribe/test"
    });

    expect(rendered).toContain("Hello Sara");
    expect(rendered).toContain("Book here:");
    expect(rendered).toContain("https://virtuprose.com");
    expect(rendered).toContain("https://sales.virtuprose.com/unsubscribe/test");
    expect(rendered).not.toContain("{{body_html}}");
  });

  it("keeps the built-in Virtuprose premium template send-ready", () => {
    const prepared = prepareEmailDesignHtml(VIRTUPROSE_SIGNATURE_PREMIUM_HTML);

    expect(prepared.status).toBe(EmailDesignValidationStatus.VALID);
    expect(prepared.errors).toEqual([]);
    expect(prepared.sanitizedHtml).toContain("{{body_html}}");
    expect(prepared.sanitizedHtml).toContain("{{unsubscribe_url}}");

    const rendered = renderCustomEmailHtml({
      designHtml: prepared.sanitizedHtml,
      account: { fromName: "Virtuprose" },
      subject: "Automation idea",
      text: "Hi Sara,\n\nCould we discuss one process to improve?",
      lead: {
        firstName: "Sara",
        company: "Growth Studio",
        email: "sara@example.com"
      },
      unsubscribeUrl: "https://sales.virtuprose.com/unsubscribe/test"
    });

    expect(rendered).toContain("Growth Studio");
    expect(rendered).toContain("Could we discuss one process");
    expect(rendered).toContain("sara@example.com");
    expect(rendered).not.toContain("{{body_html}}");
  });
});
