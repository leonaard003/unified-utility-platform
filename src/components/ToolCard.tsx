import Link from 'next/link';

export default function ToolCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link className="tool-card" href={href}>
      <h2>{title}</h2>
      <p>{description}</p>
    </Link>
  );
}
