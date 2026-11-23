/* Plain helpers the Club Account sections share — kept apart from the
   components so each file exports one kind of thing. */

const GENDER = { male: { ar: 'ذكر', en: 'Male' }, female: { ar: 'أنثى', en: 'Female' } };

export function genderLabel(value, ar) {
  const entry = GENDER[value];
  return entry ? (ar ? entry.ar : entry.en) : '';
}

/**
 * Where a person on the roster stands: an invitation still waiting, or a
 * linked member whose membership is live (or no longer is).
 */
export function memberStatus(person, ar) {
  if (person.isPending) return { tone: 'pending', label: ar ? 'دعوة قيد الانتظار' : 'Invitation pending' };
  if (person.membershipStatus === 'expired') return { tone: 'muted', label: ar ? 'العضوية منتهية' : 'Membership expired' };
  if (person.membershipStatus === 'suspended') return { tone: 'muted', label: ar ? 'العضوية موقوفة' : 'Membership suspended' };
  return { tone: 'ok', label: ar ? 'نشط' : 'Active' };
}

export function personName(person, ar) {
  return (ar ? person.nameAr || person.nameEn : person.nameEn || person.nameAr) || person.displayName || person.email;
}
