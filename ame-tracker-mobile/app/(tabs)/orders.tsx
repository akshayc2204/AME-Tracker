import React, { useCallback, useState, useMemo, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, ScrollView, TextInput, Platform,
  BackHandler, Modal,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import {
  Truck, FolderKanban, Settings, Package,
  Search, CheckCircle2, ChevronRight, ChevronLeft, ArrowLeft,
  List, Layers, RefreshCw, Calendar, X,
} from 'lucide-react-native'
import { listTransitsGrouped } from '@/services/transits'
import type { VehicleDispatchGroup, VehicleProjectItem, VehicleJobItem, VehiclePartItem } from '@/types/api'

/* ─── Types ─── */
type DispatchTab = 'all' | 'project' | 'job'

type NavView =
  | { type: 'list' }
  | { type: 'vehicle'; vehicle: VehicleDispatchGroup; tab: DispatchTab }
  | { type: 'project'; vehicle: VehicleDispatchGroup; project: VehicleProjectItem }
  | { type: 'job'; vehicle: VehicleDispatchGroup; project: VehicleProjectItem; job: VehicleJobItem }

type FlatPart = VehiclePartItem & {
  projectName: string
  jobCode: string
  jobName: string
}

/* ─── Helpers ─── */
function formatTimestamp(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

type DateFilter = 'all' | 'today' | 'yesterday' | 'custom'

function isSameDay(iso: string, date: Date) {
  const d = new Date(iso)
  return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate()
}

function flattenParts(vehicle: VehicleDispatchGroup): FlatPart[] {
  const result: FlatPart[] = []
  for (const project of vehicle.projects ?? []) {
    for (const job of project.jobs ?? []) {
      for (const part of job.parts ?? []) {
        result.push({ ...part, projectName: project.projectName, jobCode: job.jobCode, jobName: job.jobName })
      }
    }
  }
  return result.sort((a, b) => Number(a.pieceNumber) - Number(b.pieceNumber))
}

/* ─── Sub-components ─── */
function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'ACTIVE'
  return (
    <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusCompleted]}>
      <Text style={[styles.statusBadgeText, isActive ? styles.statusActiveText : styles.statusCompletedText]}>
        {isActive ? '● ACTIVE' : '✓ DONE'}
      </Text>
    </View>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={styles.sectionCount}>
        <Text style={styles.sectionCountText}>{count}</Text>
      </View>
    </View>
  )
}

function PartRow({ part, showProject }: { part: FlatPart; showProject?: boolean }) {
  return (
    <View style={styles.partRow}>
      <View style={styles.partPieceCircle}>
        <Text style={styles.partPieceNumber}>#{part.pieceNumber}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.partFittingText} numberOfLines={1}>{part.fitting || 'Standard Duct'}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
          {showProject && (
            <Text style={styles.partProjectTag} numberOfLines={1}>{part.projectName}</Text>
          )}
          {part.itemTracking ? <Text style={styles.partTrackingText}>{part.itemTracking}</Text> : null}
        </View>
      </View>
      <View style={styles.partStatusChip}>
        <CheckCircle2 size={11} color="#047857" />
        <Text style={styles.partStatusText}>{part.status === 'SHIPPED' ? 'Shipped' : 'Loaded'}</Text>
      </View>
    </View>
  )
}

function CalendarPickerModal({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
}: {
  visible: boolean
  selectedDate: string
  onSelectDate: (d: string) => void
  onClose: () => void
}) {
  const initial = selectedDate ? new Date(selectedDate) : new Date()
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  useEffect(() => {
    if (selectedDate) {
      const d = new Date(selectedDate)
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear())
        setViewMonth(d.getMonth())
      }
    }
  }, [selectedDate, visible])

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startDayOffset = new Date(viewYear, viewMonth, 1).getDay()

  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.modalCard} activeOpacity={1} onPress={e => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Calendar size={18} color="#047857" />
              <Text style={styles.modalTitle}>Select Date</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <X size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn}>
              <ChevronLeft size={20} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.monthNavTitle}>
              {monthNames[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn}>
              <ChevronRight size={20} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {weekDays.map(d => (
              <Text key={d} style={styles.weekLabel}>{d}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {Array.from({ length: startDayOffset }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isSelected = selectedDate === dateStr
              const isToday = todayStr === dateStr

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => {
                    onSelectDate(dateStr)
                    onClose()
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.dayText,
                    isSelected && styles.dayTextSelected,
                    isToday && !isSelected && styles.dayTextToday,
                  ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

/* ─── VIEW: Dispatch List ─── */
function DispatchListView({
  vehicles, loading, searchQuery, setSearchQuery, onSelectVehicle, onRefresh,
}: {
  vehicles: VehicleDispatchGroup[]; loading: boolean; searchQuery: string;
  setSearchQuery: (q: string) => void; onSelectVehicle: (v: VehicleDispatchGroup) => void;
  onRefresh: () => void;
}) {
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [customDate, setCustomDate] = useState('')
  const [showCalendar, setShowCalendar] = useState(false)

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const yesterday = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() - 1); return d }, [today])

  const filtered = useMemo(() => {
    let result = vehicles
    if (dateFilter === 'today') result = result.filter(v => isSameDay(v.startedAt, today))
    else if (dateFilter === 'yesterday') result = result.filter(v => isSameDay(v.startedAt, yesterday))
    else if (dateFilter === 'custom' && customDate) {
      const picked = new Date(customDate); picked.setHours(0, 0, 0, 0)
      result = result.filter(v => isSameDay(v.startedAt, picked))
    }
    if (!searchQuery.trim()) return result
    const q = searchQuery.toLowerCase()
    return result.filter(v =>
      v.vehicleNumber.toLowerCase().includes(q) ||
      v.projects?.some(p => p.projectName.toLowerCase().includes(q) ||
        p.jobs?.some(j => j.jobName.toLowerCase().includes(q) || j.jobCode.toLowerCase().includes(q)))
    )
  }, [vehicles, searchQuery, dateFilter, customDate, today, yesterday])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Truck size={24} color="#047857" />
            <Text style={styles.headerTitle}>Dispatches</Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            <RefreshCw size={18} color="#047857" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>Tap a vehicle to view its manifest</Text>
        <View style={styles.searchContainer}>
          <Search size={16} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput} placeholder="Search vehicle, project, job…"
            placeholderTextColor="#9CA3AF" value={searchQuery}
            onChangeText={setSearchQuery} autoCapitalize="none"
          />
        </View>
      </View>

      {/* Date Filter Chips */}
      <View style={styles.dateFilterBar}>
        <Text style={styles.dateFilterLabel}>Date:</Text>
        <TouchableOpacity
          style={[styles.dateChip, dateFilter === 'today' && styles.dateChipActive]}
          onPress={() => setDateFilter('today')}
          activeOpacity={0.7}
        >
          <Text style={[styles.dateChipText, dateFilter === 'today' && styles.dateChipTextActive]}>
            Today
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dateChip, dateFilter === 'yesterday' && styles.dateChipActive]}
          onPress={() => setDateFilter('yesterday')}
          activeOpacity={0.7}
        >
          <Text style={[styles.dateChipText, dateFilter === 'yesterday' && styles.dateChipTextActive]}>
            Yesterday
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.dateChip,
            styles.calendarChip,
            dateFilter === 'custom' && styles.dateChipActive,
          ]}
          onPress={() => setShowCalendar(true)}
          activeOpacity={0.7}
        >
          <Calendar
            size={15}
            color={dateFilter === 'custom' ? '#FFFFFF' : '#047857'}
          />
          {dateFilter === 'custom' && customDate ? (
            <Text style={[styles.dateChipText, styles.dateChipTextActive, { marginLeft: 4 }]}>
              {new Date(customDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>

      <CalendarPickerModal
        visible={showCalendar}
        selectedDate={customDate}
        onSelectDate={d => {
          setCustomDate(d)
          setDateFilter('custom')
        }}
        onClose={() => setShowCalendar(false)}
      />

      {dateFilter !== 'all' && (
        <View style={styles.activeDateBanner}>
          <Text style={styles.activeDateBannerText}>
            {dateFilter === 'today' ? `Showing: Today — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` :
              dateFilter === 'yesterday' ? `Showing: Yesterday — ${new Date(Date.now() - 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` :
                customDate ? `Showing: ${new Date(customDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'Pick a date'}
          </Text>
          <Text style={styles.activeDateCount}>{filtered.length} vehicle{filtered.length !== 1 ? 's' : ''}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#047857" size="large" />
          <Text style={styles.loadingText}>Loading dispatches…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Truck size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>
                {dateFilter === 'today' ? 'No Dispatches Today' : 'No Dispatches Found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {dateFilter === 'today'
                  ? 'No vehicle was dispatched today. Tap below to see full history.'
                  : (searchQuery ? 'No results match your search' : 'Start a dispatch from the Home tab')}
              </Text>
              {dateFilter !== 'all' && (
                <TouchableOpacity
                  style={[styles.viewAllFooterBtn, { marginTop: 16 }]}
                  onPress={() => setDateFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewAllFooterText}>View All Dispatches ({vehicles.length})</Text>
                  <ChevronRight size={16} color="#047857" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {filtered.map(vehicle => {
                const isActive = vehicle.status === 'ACTIVE'
                return (
                  <TouchableOpacity
                    key={vehicle.id} style={styles.vehicleCard}
                    onPress={() => onSelectVehicle(vehicle)} activeOpacity={0.7}
                  >
                    <View style={[styles.vehicleIconBadge, { backgroundColor: isActive ? '#DCFCE7' : '#F3F4F6' }]}>
                      <Truck size={22} color={isActive ? '#047857' : '#6B7280'} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.vehiclePlateText}>{vehicle.vehicleNumber}</Text>
                        <StatusBadge status={vehicle.status} />
                      </View>
                      <View style={styles.vehicleMetaRow}>
                        <Text style={styles.vehicleMetaText}>{vehicle.totalParts} parts</Text>
                        <Text style={styles.metaDot}>·</Text>
                        <Text style={styles.vehicleMetaText}>{vehicle.projects?.length || 0} projects</Text>
                        <Text style={styles.metaDot}>·</Text>
                        <Text style={styles.vehicleMetaText}>{formatTimestamp(vehicle.startedAt)}</Text>
                      </View>
                    </View>
                    <ChevronRight size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                )
              })}

              {/* View All Option at end of Today / Date list */}
              {dateFilter !== 'all' && (
                <TouchableOpacity
                  style={styles.viewAllFooterBtn}
                  onPress={() => setDateFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewAllFooterText}>View All Overall Dispatches ({vehicles.length})</Text>
                  <ChevronRight size={16} color="#047857" />
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

/* ─── VIEW: Vehicle Detail ─── */
function VehicleDetailView({
  vehicle, tab, setTab, onBack, onSelectProject, onSelectJob,
}: {
  vehicle: VehicleDispatchGroup; tab: DispatchTab; setTab: (t: DispatchTab) => void;
  onBack: () => void; onSelectProject: (p: VehicleProjectItem) => void;
  onSelectJob: (p: VehicleProjectItem, j: VehicleJobItem) => void;
}) {
  const allParts = useMemo(() => flattenParts(vehicle), [vehicle])
  const [partSearch, setPartSearch] = useState('')

  const filteredParts = useMemo(() => {
    if (!partSearch.trim()) return allParts
    const q = partSearch.toLowerCase()
    return allParts.filter(p =>
      String(p.pieceNumber).includes(q) ||
      p.fitting?.toLowerCase().includes(q) ||
      p.itemTracking?.toLowerCase().includes(q) ||
      p.projectName.toLowerCase().includes(q) ||
      p.jobName.toLowerCase().includes(q)
    )
  }, [allParts, partSearch])

  const totalJobs = vehicle.projects?.reduce((s, p) => s + (p.jobs?.length || 0), 0) || 0

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Page Header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={18} color="#374151" />
          <Text style={styles.backBtnText}>Dispatches</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle} numberOfLines={1}>{vehicle.vehicleNumber}</Text>
        <StatusBadge status={vehicle.status} />
      </View>

      {/* Stats Row */}
      <View style={styles.vehicleStatsRow}>
        {[
          { label: 'Parts', value: vehicle.totalParts || 0, color: '#047857', bg: '#ECFDF5' },
          { label: 'Projects', value: vehicle.projects?.length || 0, color: '#1D4ED8', bg: '#EFF6FF' },
          { label: 'Jobs', value: totalJobs, color: '#7C3AED', bg: '#F5F3FF' },
        ].map(s => (
          <View key={s.label} style={[styles.vehicleStatCard, { backgroundColor: s.bg }]}>
            <Text style={[styles.vehicleStatValue, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.vehicleStatLabel, { color: s.color }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab Strip */}
      <View style={styles.tabStrip}>
        {([
          { key: 'all' as DispatchTab, label: 'All Parts', icon: <List size={14} color={tab === 'all' ? '#047857' : '#6B7280'} />, count: allParts.length },
          { key: 'project' as DispatchTab, label: 'By Project', icon: <FolderKanban size={14} color={tab === 'project' ? '#047857' : '#6B7280'} />, count: vehicle.projects?.length || 0 },
          { key: 'job' as DispatchTab, label: 'By Job', icon: <Layers size={14} color={tab === 'job' ? '#047857' : '#6B7280'} />, count: totalJobs },
        ]).map(t => (
          <TouchableOpacity
            key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)} activeOpacity={0.7}
          >
            {t.icon}
            <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>{t.label}</Text>
            <View style={[styles.tabCount, tab === t.key && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, tab === t.key && styles.tabCountTextActive]}>{t.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {tab === 'all' && (
        <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
          <View style={styles.searchContainer}>
            <Search size={15} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput} placeholder="Search parts, fitting, piece #…"
              placeholderTextColor="#9CA3AF" value={partSearch}
              onChangeText={setPartSearch} autoCapitalize="none"
            />
          </View>
          <SectionHeader title={`All Parts`} count={filteredParts.length} />
          {filteredParts.length === 0 ? (
            <View style={styles.emptyChildCard}>
              <Package size={28} color="#D1D5DB" />
              <Text style={styles.emptyChildText}>No parts found</Text>
            </View>
          ) : filteredParts.map((part, i) => (
            <PartRow key={part.id ?? i} part={part} showProject />
          ))}
        </ScrollView>
      )}

      {tab === 'project' && (
        <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
          <SectionHeader title="Projects" count={vehicle.projects?.length || 0} />
          {(!vehicle.projects || vehicle.projects.length === 0) ? (
            <View style={styles.emptyChildCard}>
              <Package size={28} color="#D1D5DB" />
              <Text style={styles.emptyChildText}>No projects loaded yet</Text>
            </View>
          ) : vehicle.projects.map(project => (
            <TouchableOpacity
              key={project.projectName} style={styles.projectCard}
              onPress={() => onSelectProject(project)} activeOpacity={0.7}
            >
              <View style={styles.projectIconBadge}>
                <FolderKanban size={20} color="#1D4ED8" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.projectNameText} numberOfLines={1}>{project.projectName}</Text>
                <Text style={styles.projectMetaText}>
                  {project.partCount} parts · {project.jobs?.length || 0} jobs
                </Text>
              </View>
              <View style={styles.projBadge}>
                <Text style={styles.projBadgeText}>{project.partCount}</Text>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {tab === 'job' && (
        <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
          <SectionHeader title="Jobs" count={totalJobs} />
          {vehicle.projects?.flatMap(project =>
            project.jobs?.map(job => (
              <TouchableOpacity
                key={job.jobCode} style={styles.jobCard}
                onPress={() => onSelectJob(project, job)} activeOpacity={0.7}
              >
                <View style={styles.jobIconBadge}>
                  <Settings size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.jobNameText} numberOfLines={1}>{job.jobName}</Text>
                  <Text style={styles.jobMetaText}>#{job.jobCode} · <Text style={{ color: '#1D4ED8' }}>{project.projectName}</Text></Text>
                </View>
                <View style={styles.jobBadge}>
                  <Text style={styles.jobBadgeText}>{job.partCount}</Text>
                </View>
                <ChevronRight size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )) ?? []
          )}
        </ScrollView>
      )}
    </View>
  )
}

/* ─── VIEW: Project Detail ─── */
function ProjectDetailView({ vehicle, project, onBack, onSelectJob }: {
  vehicle: VehicleDispatchGroup; project: VehicleProjectItem;
  onBack: () => void; onSelectJob: (j: VehicleJobItem) => void;
}) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={18} color="#374151" />
          <Text style={styles.backBtnText}>{vehicle.vehicleNumber}</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle} numberOfLines={1}>{project.projectName}</Text>
      </View>

      {/* Hero Card */}
      <View style={styles.heroCard}>
        <View style={[styles.heroIcon, { backgroundColor: '#EFF6FF' }]}>
          <FolderKanban size={26} color="#1D4ED8" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroTitle, { color: '#1E3A8A' }]}>{project.projectName}</Text>
          <Text style={styles.heroMeta}>{project.partCount} parts · {project.jobs?.length || 0} jobs</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Jobs" count={project.jobs?.length || 0} />
        {(!project.jobs || project.jobs.length === 0) ? (
          <View style={styles.emptyChildCard}>
            <Package size={28} color="#D1D5DB" />
            <Text style={styles.emptyChildText}>No jobs in this project</Text>
          </View>
        ) : project.jobs.map(job => (
          <TouchableOpacity
            key={job.jobCode} style={styles.jobCard}
            onPress={() => onSelectJob(job)} activeOpacity={0.7}
          >
            <View style={styles.jobIconBadge}>
              <Settings size={18} color="#7C3AED" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.jobNameText} numberOfLines={1}>{job.jobName}</Text>
              <Text style={styles.jobMetaText}>Job Code: #{job.jobCode}</Text>
            </View>
            <View style={styles.jobBadge}>
              <Text style={styles.jobBadgeText}>{job.partCount}</Text>
            </View>
            <ChevronRight size={18} color="#9CA3AF" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

/* ─── VIEW: Job Detail ─── */
function JobDetailView({ vehicle, project, job, onBack }: {
  vehicle: VehicleDispatchGroup; project: VehicleProjectItem;
  job: VehicleJobItem; onBack: () => void;
}) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={18} color="#374151" />
          <Text style={styles.backBtnText}>{project.projectName}</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle} numberOfLines={1}>{job.jobName}</Text>
      </View>

      {/* Hero Card */}
      <View style={styles.heroCard}>
        <View style={[styles.heroIcon, { backgroundColor: '#F5F3FF' }]}>
          <Settings size={24} color="#7C3AED" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroTitle, { color: '#1E293B' }]}>{job.jobName}</Text>
          <Text style={styles.heroMeta}>#{job.jobCode} · {job.partCount} parts</Text>
          <Text style={[styles.heroMeta, { color: '#1D4ED8' }]}>{project.projectName}</Text>
        </View>
        <View style={styles.jobBigBadge}>
          <Text style={styles.jobBigBadgeText}>{job.partCount}</Text>
          <Text style={styles.jobBigBadgeLabel}>parts</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Parts Manifest" count={job.parts?.length || 0} />
        {(!job.parts || job.parts.length === 0) ? (
          <View style={styles.emptyChildCard}>
            <Package size={28} color="#D1D5DB" />
            <Text style={styles.emptyChildText}>No pieces recorded</Text>
          </View>
        ) : job.parts.map((part, i) => (
          <PartRow key={part.id ?? i} part={{ ...part, projectName: project.projectName, jobCode: job.jobCode, jobName: job.jobName }} />
        ))}
      </ScrollView>
    </View>
  )
}

/* ─── MAIN ─── */
export default function DispatchesTab() {
  const [vehicles, setVehicles] = useState<VehicleDispatchGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [view, setView] = useState<NavView>({ type: 'list' })
  const [vehicleTab, setVehicleTab] = useState<DispatchTab>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listTransitsGrouped()
      setVehicles(data as unknown as VehicleDispatchGroup[])
    } catch {
      setVehicles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  // Android hardware back button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view.type === 'job') { setView({ type: 'project', vehicle: view.vehicle, project: view.project }); return true }
      if (view.type === 'project') { setView({ type: 'vehicle', vehicle: view.vehicle, tab: 'project' }); return true }
      if (view.type === 'vehicle') { setView({ type: 'list' }); return true }
      return false
    })
    return () => handler.remove()
  }, [view])

  if (view.type === 'list') {
    return (
      <DispatchListView
        vehicles={vehicles} loading={loading} searchQuery={searchQuery}
        setSearchQuery={setSearchQuery} onRefresh={load}
        onSelectVehicle={vehicle => { setVehicleTab('all'); setView({ type: 'vehicle', vehicle, tab: 'all' }) }}
      />
    )
  }

  if (view.type === 'vehicle') {
    return (
      <VehicleDetailView
        vehicle={view.vehicle} tab={vehicleTab}
        setTab={t => { setVehicleTab(t); setView({ ...view, tab: t }) }}
        onBack={() => setView({ type: 'list' })}
        onSelectProject={p => setView({ type: 'project', vehicle: view.vehicle, project: p })}
        onSelectJob={(p, j) => setView({ type: 'job', vehicle: view.vehicle, project: p, job: j })}
      />
    )
  }

  if (view.type === 'project') {
    return (
      <ProjectDetailView
        vehicle={view.vehicle} project={view.project}
        onBack={() => setView({ type: 'vehicle', vehicle: view.vehicle, tab: 'project' })}
        onSelectJob={j => setView({ type: 'job', vehicle: view.vehicle, project: view.project, job: j })}
      />
    )
  }

  if (view.type === 'job') {
    return (
      <JobDetailView
        vehicle={view.vehicle} project={view.project} job={view.job}
        onBack={() => setView({ type: 'project', vehicle: view.vehicle, project: view.project })}
      />
    )
  }

  return null
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  // Header
  header: { backgroundColor: '#FFFFFF', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: '#047857', fontWeight: '600', marginTop: 3 },
  refreshBtn: { padding: 8, borderRadius: 8, backgroundColor: '#F0FDF4' },

  // Search
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0, color: '#111827' },

  // List
  listContent: { padding: 16, paddingBottom: 100, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#374151', marginTop: 14 },
  emptySubtitle: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },

  // Vehicle Card
  vehicleCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  vehicleIconBadge: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  vehiclePlateText: { fontSize: 17, fontWeight: '800', color: '#111827' },
  vehicleMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  vehicleMetaText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  metaDot: { marginHorizontal: 5, color: '#9CA3AF' },

  // Status Badge
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  statusActive: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  statusActiveText: { color: '#047857' },
  statusCompleted: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  statusCompletedText: { color: '#4B5563' },

  // Detail Header
  detailHeader: { backgroundColor: '#FFFFFF', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 6 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backBtnText: { fontSize: 14, fontWeight: '700', color: '#047857' },
  detailTitle: { fontSize: 22, fontWeight: '900', color: '#111827', letterSpacing: -0.5 },

  // Vehicle Stats
  vehicleStatsRow: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  vehicleStatCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  vehicleStatValue: { fontSize: 24, fontWeight: '900', lineHeight: 26 },
  vehicleStatLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },

  // Tab Strip
  tabStrip: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F3F4F6' },
  tabBtnActive: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  tabBtnText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  tabBtnTextActive: { color: '#047857' },
  tabCount: { backgroundColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabCountActive: { backgroundColor: '#DCFCE7' },
  tabCountText: { fontSize: 10, fontWeight: '800', color: '#6B7280' },
  tabCountTextActive: { color: '#047857' },

  // Tab Content
  tabContent: { padding: 16, paddingBottom: 100, gap: 8 },

  // Section Header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionHeaderText: { fontSize: 13, fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { backgroundColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  sectionCountText: { fontSize: 11, fontWeight: '800', color: '#6B7280' },

  // Hero Card
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  heroIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroTitle: { fontSize: 16, fontWeight: '800' },
  heroMeta: { fontSize: 12, color: '#6B7280', marginTop: 3 },

  // Project Card
  projectCard: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, flexDirection: 'row', alignItems: 'center' },
  projectIconBadge: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  projectNameText: { fontSize: 15, fontWeight: '800', color: '#1E3A8A' },
  projectMetaText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  projBadge: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  projBadgeText: { fontSize: 12, fontWeight: '800', color: '#1D4ED8' },

  // Job Card
  jobCard: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, flexDirection: 'row', alignItems: 'center' },
  jobIconBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  jobNameText: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  jobMetaText: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  jobBadge: { backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  jobBadgeText: { fontSize: 12, fontWeight: '800', color: '#7C3AED' },
  jobBigBadge: { alignItems: 'center', backgroundColor: '#F5F3FF', borderRadius: 12, padding: 10 },
  jobBigBadgeText: { fontSize: 22, fontWeight: '900', color: '#7C3AED', lineHeight: 24 },
  jobBigBadgeLabel: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },

  // Part Row
  partRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#F3F4F6', paddingVertical: 10, paddingHorizontal: 12 },
  partPieceCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  partPieceNumber: { fontSize: 12, fontWeight: '800', color: '#047857' },
  partFittingText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  partProjectTag: { fontSize: 10, fontWeight: '700', color: '#1D4ED8', backgroundColor: '#EFF6FF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  partTrackingText: { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '700', color: '#1E293B', backgroundColor: '#E2E8F0', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  partStatusChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  partStatusText: { fontSize: 10, fontWeight: '700', color: '#047857' },

  // Empty Child
  emptyChildCard: { padding: 28, alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  emptyChildText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },

  // Date Filter
  dateFilterBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 6, flexWrap: 'wrap' },
  dateFilterLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginRight: 2 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: '#F3F4F6' },
  calendarChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 },
  dateChipActive: { backgroundColor: '#047857' },
  dateChipText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  dateChipTextActive: { color: '#FFFFFF' },
  activeDateBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ECFDF5', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#A7F3D0' },
  activeDateBannerText: { fontSize: 12, fontWeight: '600', color: '#047857' },
  activeDateCount: { fontSize: 12, fontWeight: '800', color: '#047857' },

  // View All Footer Action
  viewAllFooterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#A7F3D0', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginTop: 10, gap: 6 },
  viewAllFooterText: { fontSize: 13, fontWeight: '800', color: '#047857' },

  // Calendar Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 340, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  modalCloseBtn: { padding: 4 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthNavBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  monthNavTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  weekLabel: { width: 36, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  dayCell: { width: '14.28%', height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginVertical: 2 },
  dayCellSelected: { backgroundColor: '#047857' },
  dayCellToday: { borderWidth: 1.5, borderColor: '#047857' },
  dayText: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  dayTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  dayTextToday: { color: '#047857', fontWeight: '800' },
})
