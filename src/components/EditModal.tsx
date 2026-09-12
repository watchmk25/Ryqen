import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, StyleSheet } from 'react-native'
import { C, T } from '../constants'

type EditModalProps = { visible: boolean; title: string; onClose: () => void; onSave: () => void; saving: boolean; children: React.ReactNode }

export function EditModal({ visible, title, onClose, onSave, saving, children }: EditModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000077' }} activeOpacity={1} onPress={onClose} />
      <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.sep, alignSelf: 'center', marginTop: 10, marginBottom: 4 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sep }}>
          <Text style={T.headline}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 15, color: C.t2 }}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep }}>
          <TouchableOpacity style={{ backgroundColor: C.accent, borderRadius: 14, padding: 15, alignItems: 'center' }} onPress={onSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
