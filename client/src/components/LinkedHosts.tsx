import { useLocation } from "wouter";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";

const PEOPLE_BY_NAME = new Map(PEOPLE_DIRECTORY.map(p => [p.name, p.slug]));

export function LinkedHosts({ hosts, className }: { hosts: string; className?: string }) {
  const [, navigate] = useLocation();
  const parts = hosts.split(/(\s*[&,]\s*)/);

  const elements = parts.map((part, i) => {
    const trimmed = part.trim();
    const slug = PEOPLE_BY_NAME.get(trimmed);
    if (slug) {
      return (
        <span
          key={i}
          role="link"
          tabIndex={0}
          className="text-[#52525B] hover:text-primary transition-colors cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/people/${slug}`);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/people/${slug}`);
            }
          }}
          data-testid={`link-host-${slug}`}
        >
          {trimmed}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });

  return <span className={className}>{elements}</span>;
}
