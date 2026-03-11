import { Link } from "wouter";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";

const PEOPLE_BY_NAME = new Map(PEOPLE_DIRECTORY.map(p => [p.name, p.slug]));

export function LinkedHosts({ hosts, className }: { hosts: string; className?: string }) {
  const parts = hosts.split(/(\s*[&,]\s*)/);

  const elements = parts.map((part, i) => {
    const trimmed = part.trim();
    const slug = PEOPLE_BY_NAME.get(trimmed);
    if (slug) {
      return (
        <Link
          key={i}
          href={`/people/${slug}`}
          className="text-foreground/70 hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
          data-testid={`link-host-${slug}`}
        >
          {trimmed}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });

  return <span className={className}>{elements}</span>;
}
