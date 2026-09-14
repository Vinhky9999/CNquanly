import { Badge } from "@/components/ui/badge";

export function TagBadge({ name, color }: { name: string; color?: string | null }) {
  if (!color) {
    return <Badge variant="secondary">{name}</Badge>;
  }
  return (
    <Badge className="border-transparent text-white" style={{ backgroundColor: color }}>
      {name}
    </Badge>
  );
}
