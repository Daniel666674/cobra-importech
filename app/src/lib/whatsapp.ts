/** Enlace para abrir WhatsApp con el mensaje ya escrito (el envío lo confirma una persona). */
export function waLink(phone: string, text: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 10) d = "57" + d; // celular colombiano sin indicativo
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
