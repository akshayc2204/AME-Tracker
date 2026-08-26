import { Tabs } from 'expo-router'
import {
  Home,
  CircleHelp as HelpCircle,
  User,
  ClipboardList,
} from 'lucide-react-native'
import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ACTIVE_COLOR = '#078710'
const INACTIVE_COLOR = '#9CA3AF'
const TAB_BG = '#FFFFFF'

type TabBarIconProps = {
  color: string
  size: number
  focused: boolean
  icon: React.ReactNode
  label: string
}

function TabItem({ focused, icon, label }: TabBarIconProps) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        {icon}
      </View>
      <Text
        style={[
          styles.tabLabel,
          { color: focused ? ACTIVE_COLOR : INACTIVE_COLOR },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

export default function TabLayout() {
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [
          styles.tabBar,
          { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 },
        ],
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarBackground: () => <View style={styles.tabBarBg} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabItem
              color={color}
              size={size}
              focused={focused}
              icon={
                <Home
                  size={22}
                  color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
                  strokeWidth={focused ? 2.2 : 1.8}
                />
              }
              label="Home"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabItem
              color={color}
              size={size}
              focused={focused}
              icon={
                <ClipboardList
                  size={22}
                  color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
                  strokeWidth={focused ? 2.2 : 1.8}
                />
              }
              label="Dispatches"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabItem
              color={color}
              size={size}
              focused={focused}
              icon={
                <HelpCircle
                  size={22}
                  color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
                  strokeWidth={focused ? 2.2 : 1.8}
                />
              }
              label="Help"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabItem
              color={color}
              size={size}
              focused={focused}
              icon={
                <User
                  size={22}
                  color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
                  strokeWidth={focused ? 2.2 : 1.8}
                />
              }
              label="Profile"
            />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    height: 70,
    position: 'absolute',
  },
  tabBarBg: {
    flex: 1,
    backgroundColor: TAB_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 8,
    minWidth: 60,
  },
  iconWrap: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconWrapActive: {
    backgroundColor: '#E8F5E9',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
})
