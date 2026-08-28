import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EntityType } from '@whilom/domain';
import { correctionSchema, reviewSchema, visitSchema } from '@whilom/validation';
import { AsyncNotice } from './WhilomUI';
import { fieldErrorsFromZod, type ActionState } from '../lib/action-state';
import { mutationPlaceId, useMobileBehaviour } from '../lib/behaviour';
import { useMobileTheme } from '../theme';

function Result({ result }: { result: ActionState<unknown> }) {
  if (result.status === 'submitting') return <AsyncNotice kind="loading" title="Submitting" detail="Keeping your contribution behind the Whilom review boundary." />;
  if (result.status === 'error') return <AsyncNotice kind="error" title="Could not submit" detail={result.error ?? 'Check the details and try again.'} />;
  if (result.status === 'success') return <Text style={[styles.success, { color: useMobileTheme().colors.success }]}>Saved in this fixture session. Live account submission remains an RLS-governed future seam.</Text>;
  return null;
}

function Field({ label, value, onChangeText, placeholder, multiline = false, error, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; error?: string; keyboardType?: 'default' | 'numeric' }) {
  const theme = useMobileTheme();
  return <View style={styles.field}><Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.colors.textFaint} multiline={multiline} keyboardType={keyboardType} style={[styles.input, multiline && styles.multiline, { color: theme.colors.text, backgroundColor: theme.colors.surfaceMuted, borderColor: error ? theme.colors.danger : theme.colors.border }]} />{error ? <Text style={[styles.fieldError, { color: theme.colors.danger }]}>{error}</Text> : null}</View>;
}

function Rating({ value, onChange }: { value?: number; onChange: (value: number) => void }) {
  const theme = useMobileTheme();
  return <View style={styles.rating} accessibilityRole="radiogroup" accessibilityLabel="Rating"><Text style={[styles.label, { color: theme.colors.text }]}>Rating</Text><View style={styles.ratingRow}>{[1, 2, 3, 4, 5].map((rating) => <Pressable key={rating} accessibilityRole="radio" accessibilityLabel={`${rating} out of 5`} accessibilityState={{ selected: value === rating }} onPress={() => onChange(rating)} style={[styles.ratingButton, { minWidth: theme.controls.compactTarget, minHeight: theme.controls.compactTarget, borderColor: value === rating ? theme.colors.accent : theme.colors.border, backgroundColor: value === rating ? theme.colors.accentSoft : theme.colors.surface }]}><Text style={{ color: value === rating ? theme.colors.accentStrong : theme.colors.textMuted }}>{rating}</Text></Pressable>)}</View></View>;
}

export function VisitForm({ placeId, onClose }: { placeId: string; onClose: () => void }) {
  const theme = useMobileTheme();
  const { recordVisit } = useMobileBehaviour();
  const [visitedOn, setVisitedOn] = useState(new Date().toISOString().slice(0, 10));
  const [rating, setRating] = useState<number | undefined>();
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<ActionState<unknown>>({ status: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit() {
    const input = { placeId: mutationPlaceId(placeId), visitedOn: visitedOn || undefined, rating, minutesSpent: minutes ? Number(minutes) : undefined, publicNote: note || undefined };
    const parsed = visitSchema.safeParse(input);
    if (!parsed.success) { setErrors(fieldErrorsFromZod(parsed.error)); setResult({ status: 'error', error: 'Check the highlighted visit details.' }); return; }
    setErrors({}); setResult({ status: 'submitting' });
    const next = await recordVisit({ placeId, visitedOn: parsed.data.visitedOn, rating: parsed.data.rating, minutesSpent: parsed.data.minutesSpent, publicNote: parsed.data.publicNote });
    setResult(next);
  }
  return <View style={[styles.panel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.panelTitle, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>Record a visit</Text><Text style={[styles.panelDetail, { color: theme.colors.textMuted }]}>A visit is a personal record. It does not change the published heritage history.</Text><Field label="Visited on" value={visitedOn} onChangeText={setVisitedOn} placeholder="YYYY-MM-DD" error={errors.visitedOn} /><Rating value={rating} onChange={setRating} /><Field label="Minutes spent (optional)" value={minutes} onChangeText={setMinutes} placeholder="For example 90" keyboardType="numeric" error={errors.minutesSpent} /><Field label="Public note (optional)" value={note} onChangeText={setNote} placeholder="What stayed with you?" multiline error={errors.publicNote} /><Result result={result} /><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel visit" onPress={onClose} style={[styles.secondary, { borderColor: theme.colors.border, minHeight: theme.controls.touchTarget }]}><Text style={{ color: theme.colors.text }}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Save visit" disabled={result.status === 'submitting'} onPress={() => void submit()} style={[styles.primary, { backgroundColor: theme.colors.accent, minHeight: theme.controls.touchTarget, opacity: result.status === 'submitting' ? 0.6 : 1 }]}><Text style={{ color: theme.colors.white, fontWeight: '800' }}>{result.status === 'success' ? 'Recorded' : 'Save visit'}</Text></Pressable></View></View>;
}

export function ReviewForm({ placeId, existingBody, existingRating, onClose }: { placeId: string; existingBody?: string; existingRating?: number; onClose: () => void }) {
  const theme = useMobileTheme();
  const { submitReview } = useMobileBehaviour();
  const [rating, setRating] = useState<number | undefined>(existingRating);
  const [body, setBody] = useState(existingBody ?? '');
  const [result, setResult] = useState<ActionState<unknown>>({ status: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit() {
    const parsed = reviewSchema.safeParse({ placeId: mutationPlaceId(placeId), rating, body: body || undefined });
    if (!parsed.success) { setErrors(fieldErrorsFromZod(parsed.error)); setResult({ status: 'error', error: 'Choose a rating before submitting.' }); return; }
    setErrors({}); setResult({ status: 'submitting' });
    setResult(await submitReview({ placeId, rating: parsed.data.rating, body: parsed.data.body }));
  }
  return <View style={[styles.panel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.panelTitle, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>{existingBody ? 'Edit your review' : 'Write a review'}</Text><Text style={[styles.panelDetail, { color: theme.colors.textMuted }]}>Reviews describe your experience and remain distinct from historical fact.</Text><Rating value={rating} onChange={setRating} />{errors.rating ? <Text style={[styles.fieldError, { color: theme.colors.danger }]}>{errors.rating}</Text> : null}<Field label="Review (optional)" value={body} onChangeText={setBody} placeholder="A short, considered note" multiline error={errors.body} /><Result result={result} /><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel review" onPress={onClose} style={[styles.secondary, { borderColor: theme.colors.border, minHeight: theme.controls.touchTarget }]}><Text style={{ color: theme.colors.text }}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Submit review" disabled={result.status === 'submitting'} onPress={() => void submit()} style={[styles.primary, { backgroundColor: theme.colors.accent, minHeight: theme.controls.touchTarget }]}><Text style={{ color: theme.colors.white, fontWeight: '800' }}>{result.status === 'success' ? 'Submitted' : 'Submit review'}</Text></Pressable></View></View>;
}

export function CorrectionForm({ entityId, onClose }: { entityId: string; onClose: () => void }) {
  const theme = useMobileTheme();
  const { submitCorrection } = useMobileBehaviour();
  const [field, setField] = useState('');
  const [suggestedValue, setSuggestedValue] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<ActionState<unknown>>({ status: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit() {
    const parsed = correctionSchema.safeParse({ entityType: EntityType.Place, entityId: mutationPlaceId(entityId), field: field || undefined, suggestedValue: suggestedValue || undefined, note: note || undefined });
    if (!parsed.success) { setErrors(fieldErrorsFromZod(parsed.error)); setResult({ status: 'error', error: 'Add a suggested value or explanatory note.' }); return; }
    setErrors({}); setResult({ status: 'submitting' });
    setResult(await submitCorrection({ entityType: parsed.data.entityType, entityId, field: parsed.data.field, suggestedValue: parsed.data.suggestedValue, note: parsed.data.note }));
  }
  return <View style={[styles.panel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.panelTitle, { color: theme.colors.text, fontFamily: theme.typography.editorial }]}>Suggest a correction</Text><Text style={[styles.panelDetail, { color: theme.colors.textMuted }]}>This sends a proposal for review; it never edits a canonical record directly.</Text><Field label="Field (optional)" value={field} onChangeText={setField} placeholder="For example name or description" error={errors.field} /><Field label="Suggested value (optional)" value={suggestedValue} onChangeText={setSuggestedValue} placeholder="What should be checked?" multiline error={errors.suggestedValue} /><Field label="Why this should be checked" value={note} onChangeText={setNote} placeholder="Give the source or context" multiline error={errors.note} /><Result result={result} /><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel correction" onPress={onClose} style={[styles.secondary, { borderColor: theme.colors.border, minHeight: theme.controls.touchTarget }]}><Text style={{ color: theme.colors.text }}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Submit correction" disabled={result.status === 'submitting'} onPress={() => void submit()} style={[styles.primary, { backgroundColor: theme.colors.accent, minHeight: theme.controls.touchTarget }]}><Text style={{ color: theme.colors.white, fontWeight: '800' }}>{result.status === 'success' ? 'Submitted' : 'Send proposal'}</Text></Pressable></View></View>;
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 11 },
  panelTitle: { fontSize: 20, fontWeight: '800' },
  panelDetail: { fontSize: 12, lineHeight: 17 },
  field: { gap: 5 },
  label: { fontSize: 12, fontWeight: '800' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 4, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  fieldError: { fontSize: 11 },
  rating: { gap: 5 },
  ratingRow: { flexDirection: 'row', gap: 7 },
  ratingButton: { borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  primary: { borderRadius: 4, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  secondary: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  success: { fontSize: 12, lineHeight: 17 },
});
