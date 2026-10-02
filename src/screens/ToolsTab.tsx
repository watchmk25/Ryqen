import { View, Text, ScrollView } from 'react-native'
import { T } from '../constants'
import { WaterTracker, FocusTimer } from '../components'

type ToolsTabProps = { userId: string; setXp: (xp: number) => void; showToast: (msg: string) => void }

export function ToolsTab({ userId, setXp, showToast }: ToolsTabProps) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={T.largeTitle}>Tools</Text>
        <Text style={[T.footnote, { marginTop: 4 }]}>Track and train, Hunter.</Text>
      </View>

      <View style={{ marginTop: 16 }}>
        <WaterTracker userId={userId} />
      </View>

      <View style={{ marginTop: 28 }}>
        <FocusTimer
          userId={userId}
          onSessionComplete={({ xpAwarded, totalXp }) => {
            setXp(totalXp)
            showToast(xpAwarded > 0 ? `+${xpAwarded} XP  ·  END` : 'Focus session already recorded')
          }}
        />
      </View>
    </ScrollView>
  )
}
