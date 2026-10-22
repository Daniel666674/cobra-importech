import { redirect } from "next/navigation";

/** «Tiendas aliadas» ahora es «Cartera». */
export default function Aliados() {
  redirect("/cartera");
}
