export function EmailPreviewFrame({
  title,
  html,
  mode = "desktop"
}: {
  title: string;
  html: string;
  mode?: "desktop" | "mobile";
}) {
  return (
    <div className={`email-design-frame-shell email-design-frame-${mode}`}>
      <span>{mode === "mobile" ? "Mobile" : "Desktop"}</span>
      <iframe title={title} srcDoc={html} sandbox="" />
    </div>
  );
}
