import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C, T } from '../constants'
import { useRecentActivity } from '../hooks/useRecentActivity'
import type { RecentActivity } from '../domain'

type RecentActivityModalProps = {
  visible: boolean
  userId: string | undefined
  onClose: () => void
}

function formatActivityTimestamp(occurredAt: string): string {
  const timestamp = new Date(occurredAt)
  if (!Number.isFinite(timestamp.getTime())) return 'Unknown time'
  return timestamp.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ActivityRow({ activity }: { activity: RecentActivity }) {
  return (
    <View style={{ paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
        <Text style={{ color: C.accent, fontSize: 14, fontWeight: '700' }}>{activity.label}</Text>
        <Text style={[T.subhead, { flex: 1 }]} numberOfLines={1}>{activity.subject}</Text>
      </View>
      <Text style={[T.caption1, { marginTop: 4 }]}>{formatActivityTimestamp(activity.occurredAt)}</Text>
      {activity.completionSummary && (
        <Text style={[T.caption1, { marginTop: 5, color: C.success }]}>{activity.completionSummary}</Text>
      )}
    </View>
  )
}

/** Compact, read-only profile history. It intentionally has no edit controls. */
export function RecentActivityModal({ visible, userId, onClose }: RecentActivityModalProps) {
  const { status, activities, error, reload } = useRecentActivity(userId, visible)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' }}>
        <View style={{ maxHeight: '82%', backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sep }}>
            <Text style={T.title3}>Recent activity</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close recent activity" onPress={onClose} hitSlop={10}>
              <Text style={{ color: C.t2, fontSize: 22, lineHeight: 22 }}>×</Text>
            </TouchableOpacity>
          </View>

          {status === 'loading' ? (
            <View style={{ minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <ActivityIndicator color={C.accent} />
              <Text style={T.footnote}>Loading recent activity…</Text>
            </View>
          ) : status === 'error' ? (
            <View style={{ minHeight: 190, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 14 }}>
              <Text style={[T.footnote, { textAlign: 'center' }]}>{error}</Text>
              <TouchableOpacity accessibilityRole="button" style={{ backgroundColor: C.accentDim, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }} onPress={() => void reload()}>
                <Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : activities.length === 0 ? (
            <View style={{ minHeight: 190, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
              <Text style={[T.footnote, { textAlign: 'center' }]}>No recent activity yet.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
              {activities.map((activity, index) => (
                <View key={activity.id}>
                  <ActivityRow activity={activity} />
                  {index < activities.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.sep }} />}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}
