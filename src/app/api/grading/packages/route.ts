import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { gradingPackageSchema, type GradingPackageRow } from "@/lib/grading-packages";

export const dynamic = "force-dynamic";

async function list(): Promise<GradingPackageRow[]> {
  const rows = await prisma.gradingPackage.findMany({ orderBy: [{ position: "asc" }, { company: "asc" }, { tier: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    company: r.company,
    tier: r.tier,
    estimate: r.estimate,
    priceUsd: r.priceUsd == null ? null : Number(r.priceUsd),
    costPrice: Number(r.costPrice),
    servicePrice: Number(r.servicePrice),
    position: r.position,
  }));
}

/** "psa" + "value" is the same package as "PSA" + "Value": the order form matches names without regard to case. */
async function hasSamePackage(company: string, tier: string, exceptId?: string) {
  const found = await prisma.gradingPackage.findFirst({
    where: {
      company: { equals: company, mode: "insensitive" },
      tier: { equals: tier, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(found);
}

const duplicate = () => NextResponse.json({ error: "Hãng này đã có gói cùng tên. Hãy sửa gói đó thay vì thêm mới." }, { status: 409 });
const invalid = (message: string) => NextResponse.json({ error: message }, { status: 400 });

/** The package price list of every grading company (read by the order form and the "Gói chấm" dialog). */
export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    return NextResponse.json({ packages: await list() });
  } catch {
    return NextResponse.json({ error: "Không đọc được bảng gói chấm" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const parsed = gradingPackageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  try {
    if (await hasSamePackage(parsed.data.company, parsed.data.tier)) return duplicate();
    const last = await prisma.gradingPackage.aggregate({ _max: { position: true } });
    await prisma.gradingPackage.create({ data: { ...parsed.data, position: (last._max.position ?? 0) + 1 } });
    revalidatePath("/grading");
    return NextResponse.json({ packages: await list() }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return duplicate();
    return NextResponse.json({ error: "Không lưu được gói" }, { status: 500 });
  }
}

/** Edit one package: ?id=<package id>, body = the full set of fields. */
export async function PUT(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return invalid("Thiếu mã gói");
  const parsed = gradingPackageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  try {
    if (await hasSamePackage(parsed.data.company, parsed.data.tier, id)) return duplicate();
    await prisma.gradingPackage.update({ where: { id }, data: parsed.data });
    revalidatePath("/grading");
    return NextResponse.json({ packages: await list() });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return duplicate();
      if (err.code === "P2025") return NextResponse.json({ error: "Không tìm thấy gói (có thể đã bị xoá)" }, { status: 404 });
    }
    return NextResponse.json({ error: "Không lưu được gói" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return invalid("Thiếu mã gói");
  try {
    const { count } = await prisma.gradingPackage.deleteMany({ where: { id } });
    if (count === 0) return NextResponse.json({ error: "Không tìm thấy gói (có thể đã bị xoá)" }, { status: 404 });
    revalidatePath("/grading");
    return NextResponse.json({ packages: await list() });
  } catch {
    return NextResponse.json({ error: "Không xoá được gói" }, { status: 500 });
  }
}
