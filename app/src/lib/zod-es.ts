import { z } from "zod";

/** Mensajes de validación en español para todo el sistema (los específicos de cada campo tienen prioridad). */
z.config(z.locales.es());

export { z };
