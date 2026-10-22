import { redirect } from "next/navigation";

// Compras e importación están desactivadas por ahora: los productos de otras tiendas se manejan en «Tiendas aliadas».
export default function Compras() {
  redirect("/aliados");
}
