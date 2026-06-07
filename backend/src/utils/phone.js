// Normaliza telefone para apenas dígitos, de forma que
// "11 91234-5678", "11912345678" e "(11) 91234-5678" sejam equivalentes.
export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}
