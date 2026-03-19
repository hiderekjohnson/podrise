export function LinkedHosts({ hosts, className }: { hosts: string; className?: string }) {
  return <span className={className}>{hosts}</span>;
}
