import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Not found</h1>
      <p>The requested record does not exist.</p>
      <Link className="button" href="/">
        Return home
      </Link>
    </div>
  );
}
