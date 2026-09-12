import { StyleSheet } from 'react-native'
import { C } from './theme'

export const d = StyleSheet.create({
  authContainer: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between', padding: 24, paddingTop: 80, paddingBottom: 48 },
  authTop: { alignItems: 'center' },
  authLogo: { fontSize: 42, fontWeight: '800', color: C.t1, letterSpacing: 8 },
  authForm: { gap: 12 },
  authInput: { backgroundColor: C.surface, color: C.t1, borderRadius: 14, padding: 16, fontSize: 16 },
  authBtn: { backgroundColor: C.accent, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  authBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  authSwitch: { alignItems: 'center', marginTop: 8 },
  input: { backgroundColor: C.surface, color: C.t1, borderRadius: 12, padding: 14, fontSize: 16 },
})
