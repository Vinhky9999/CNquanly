"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validations/customer";

function parseCustomerFormData(formData: FormData) {
  return {
    name: formData.get("name"),
    phone: formData.get("phone"),
    zalo: formData.get("zalo"),
    facebook: formData.get("facebook"),
    address: formData.get("address"),
    notes: formData.get("notes"),
    tagIds: formData.getAll("tagIds"),
  };
}

export async function createCustomerAction(formData: FormData) {
  const data = customerSchema.parse(parseCustomerFormData(formData));

  await prisma.customer.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      zalo: data.zalo || null,
      facebook: data.facebook || null,
      address: data.address || null,
      notes: data.notes || null,
      tags: { connect: data.tagIds.map((id) => ({ id })) },
    },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomerAction(id: string, formData: FormData) {
  const data = customerSchema.parse(parseCustomerFormData(formData));

  await prisma.customer.update({
    where: { id },
    data: {
      name: data.name,
      phone: data.phone || null,
      zalo: data.zalo || null,
      facebook: data.facebook || null,
      address: data.address || null,
      notes: data.notes || null,
      tags: { set: data.tagIds.map((id) => ({ id })) },
    },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
}

export async function deleteCustomerAction(id: string) {
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
}

export async function createCustomerTagAction(name: string) {
  const tag = await prisma.customerTag.create({ data: { name } });
  revalidatePath("/customers");
  return tag;
}

export async function updateCustomerTagAction(id: string, name: string, color?: string) {
  const tag = await prisma.customerTag.update({
    where: { id },
    data: { name, ...(color !== undefined ? { color } : {}) },
  });
  revalidatePath("/customers");
  return tag;
}

export async function deleteCustomerTagAction(id: string) {
  await prisma.customerTag.delete({ where: { id } });
  revalidatePath("/customers");
}
