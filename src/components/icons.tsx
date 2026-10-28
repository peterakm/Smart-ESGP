/**
 * Single icon registry for the Smart-ESGP workspace.
 *
 * Primary set: the official Malaysia Government Design System icon library
 * (`@govtechmy/myds-react/icon`). MYDS icons are drawn on a 20px grid and stroke with
 * `currentColor`, so they are one solid colour by construction and need no per-icon fills.
 *
 * Fallback set: `lucide-react`, used for the five domain symbols MYDS does not publish
 * (leaf, balance scale, gauge, bar chart, hash). One fallback library only - do not add
 * a third icon package. If MYDS later ships an equivalent, swap it here and nowhere else.
 *
 * Every consumer imports from this module so the mapping stays auditable in one place.
 */
import {
 ArrowDownIcon,
 ArrowForwardIcon,
 ArrowUpIcon,
 BookIcon,
 CalendarIcon,
 ChatBubbleIcon,
 CheckCircleIcon,
 CheckShieldIcon,
 ChevronDownIcon,
 ClockIcon,
 CrossCircleIcon,
 CrossIcon,
 DatabaseIcon,
 DirectionIcon,
 DocumentIcon,
 DownloadIcon,
 DuplicateIcon,
 GlobeIcon,
 GridIcon,
 HamburgerMenuIcon,
 ListIcon,
 PinIcon,
 PrinterIcon,
 QrCodeIcon,
 SearchIcon,
 SwapIcon,
 TableIcon,
 TrophyIcon,
 UserGroupIcon,
 UserIcon,
 WarningDiamondIcon,
 WarningIcon,
} from '@govtechmy/myds-react/icon';
import { BarChart3, Gauge, Hash, Leaf, Scale } from 'lucide-react';
import type { FunctionComponent, SVGProps } from 'react';

export type AppIcon = FunctionComponent<SVGProps<SVGSVGElement>>;

/**
 * Icon sizing scale. Sizes are fixed by role, never chosen ad hoc:
 * - NAV 20px - navigation and ordinary actions (the default)
 * - STATUS 16px - passive reinforcement of a text status, never interactive
 * - ACTION 24px - larger, primary actions
 * Interactive icons must sit inside a control that is at least 44x44px (TAP_TARGET).
 */
export const ICON = {
 NAV: 'h-5 w-5 shrink-0',
 STATUS: 'h-4 w-4 shrink-0',
 ACTION: 'h-6 w-6 shrink-0',
} as const;

/** Minimum interactive control box for an icon-only button (WCAG 2.2 target size). */
export const TAP_TARGET = 'inline-flex h-11 w-11 items-center justify-center';

/* -- Navigation and structure -- */
export const IconMenu: AppIcon = HamburgerMenuIcon;
export const IconClose: AppIcon = CrossIcon;
export const IconDashboard: AppIcon = GridIcon;
export const IconTable: AppIcon = TableIcon;
export const IconList: AppIcon = ListIcon;
export const IconArrowForward: AppIcon = ArrowForwardIcon;
export const IconArrowUp: AppIcon = ArrowUpIcon;
export const IconArrowDown: AppIcon = ArrowDownIcon;
export const IconSort: AppIcon = SwapIcon;
export const IconChevronDown: AppIcon = ChevronDownIcon;

/* -- Status and outcome -- */
export const IconApproved: AppIcon = CheckCircleIcon;
export const IconRejected: AppIcon = CrossCircleIcon;
export const IconWarning: AppIcon = WarningIcon;
export const IconFlag: AppIcon = WarningDiamondIcon;
export const IconVerified: AppIcon = CheckShieldIcon;

/* -- Records and evidence -- */
export const IconDocument: AppIcon = DocumentIcon;
export const IconCertificate: AppIcon = TrophyIcon;
export const IconSearch: AppIcon = SearchIcon;
export const IconDownload: AppIcon = DownloadIcon;
export const IconPrint: AppIcon = PrinterIcon;
export const IconQrCode: AppIcon = QrCodeIcon;
export const IconDuplicate: AppIcon = DuplicateIcon;
export const IconDatabase: AppIcon = DatabaseIcon;
export const IconBook: AppIcon = BookIcon;
export const IconClock: AppIcon = ClockIcon;
export const IconCalendar: AppIcon = CalendarIcon;

/* -- People, place and channel -- */
export const IconFarmers: AppIcon = UserGroupIcon;
export const IconFarmer: AppIcon = UserIcon;
export const IconChat: AppIcon = ChatBubbleIcon;
export const IconPin: AppIcon = PinIcon;
export const IconSignal: AppIcon = DirectionIcon;
export const IconGlobe: AppIcon = GlobeIcon;

/* -- Fallback set (lucide-react): no MYDS equivalent published -- */
export const IconEnvironment: AppIcon = Leaf;
export const IconGovernance: AppIcon = Scale;
export const IconScore: AppIcon = Gauge;
export const IconChart: AppIcon = BarChart3;
export const IconHash: AppIcon = Hash;
