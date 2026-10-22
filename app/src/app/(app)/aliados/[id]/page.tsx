import { redirect } from "next/navigation";

export default async function Aliada({ params }: PageProps<"/aliados/[id]">) {
  redirect(`/cartera/${(await params).id}`);
}
