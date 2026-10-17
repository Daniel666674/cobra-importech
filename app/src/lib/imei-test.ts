/** Utilidad para pruebas y semillas: completa los 14 dígitos con el dígito de control Luhn. */
export function withCheck(b: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = +b[13 - i];
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return b + ((10 - (sum % 10)) % 10);
}
