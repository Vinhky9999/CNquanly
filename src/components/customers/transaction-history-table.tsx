import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatVND } from "@/lib/utils";

interface TransactionRow {
  id: string;
  type: "PURCHASE" | "SALE";
  transactionDate: Date;
  totalAmount: number | string;
  notes: string | null;
  items: {
    id: string;
    quantity: number;
    unitPrice: number | string;
    sealedProduct: { name: string } | null;
    singleCard: { cardName: string } | null;
  }[];
}

export function TransactionHistoryTable({ transactions }: { transactions: TransactionRow[] }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có giao dịch nào.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ngày</TableHead>
          <TableHead>Loại</TableHead>
          <TableHead>Sản phẩm</TableHead>
          <TableHead>Tổng tiền</TableHead>
          <TableHead>Ghi chú</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((t) => (
          <TableRow key={t.id}>
            <TableCell>{formatDate(t.transactionDate)}</TableCell>
            <TableCell>
              <Badge variant={t.type === "SALE" ? "success" : "secondary"}>
                {t.type === "SALE" ? "Bán" : "Mua"}
              </Badge>
            </TableCell>
            <TableCell>
              {t.items
                .map((item) => item.sealedProduct?.name ?? item.singleCard?.cardName ?? "—")
                .join(", ")}
            </TableCell>
            <TableCell>{formatVND(t.totalAmount)}</TableCell>
            <TableCell className="text-muted-foreground">{t.notes ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
