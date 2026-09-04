/** Visible height of the floating tab bar, excluding the bottom safe-area inset. */
export const TAB_BAR_HEIGHT = 70

/**
 * Bottom padding a tab screen's scroll content needs so its last row clears the
 * floating tab bar, which is absolutely positioned and overlays the screen.
 */
export function tabBarScrollInset(bottomInset: number) {
  return TAB_BAR_HEIGHT + bottomInset + 16
}
