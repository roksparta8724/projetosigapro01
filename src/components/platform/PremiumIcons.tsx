import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  Bank as BankPhosphor,
  Bell as BellPhosphor,
  BookOpenText as BookOpenTextPhosphor,
  Buildings as BuildingsPhosphor,
  CaretDown as CaretDownPhosphor,
  CaretRight as CaretRightPhosphor,
  ChartBar as ChartBarPhosphor,
  Check as CheckPhosphor,
  CreditCard as CreditCardPhosphor,
  DesktopTower as DesktopTowerPhosphor,
  EnvelopeSimple as EnvelopeSimplePhosphor,
  FileText as FileTextPhosphor,
  FlagPennant as FlagPennantPhosphor,
  GearSix as GearSixPhosphor,
  List as ListPhosphor,
  ListChecks as ListChecksPhosphor,
  MagnifyingGlass as MagnifyingGlassPhosphor,
  MapPin as MapPinPhosphor,
  Palette as PalettePhosphor,
  PencilSimpleLine as PencilSimpleLinePhosphor,
  Phone as PhonePhosphor,
  PlusCircle as PlusCirclePhosphor,
  Power as PowerPhosphor,
  Scroll as ScrollPhosphor,
  SignOut as SignOutPhosphor,
  SquaresFour as SquaresFourPhosphor,
  StackSimple as StackSimplePhosphor,
  Trash as TrashPhosphor,
  UserCircle as UserCirclePhosphor,
  Wallet as WalletPhosphor,
  X as XPhosphor,
  ClockCounterClockwise as ClockCounterClockwisePhosphor,
} from "@phosphor-icons/react";

type PremiumIconComponent = ComponentType<{ className?: string }>;

function createFilledIcon(Icon: ComponentType<IconProps>): PremiumIconComponent {
  return function FilledIcon({ className }) {
    return <Icon weight="fill" className={className} />;
  };
}

export const Building2 = createFilledIcon(BuildingsPhosphor);
export const Bell = createFilledIcon(BellPhosphor);
export const BellIcon = Bell;
export const BookOpenText = createFilledIcon(BookOpenTextPhosphor);
export const BookOpenTextIcon = BookOpenText;
export const Check = createFilledIcon(CheckPhosphor);
export const CheckIcon = Check;
export const ChevronDown = createFilledIcon(CaretDownPhosphor);
export const ChevronDownIcon = ChevronDown;
export const ChevronRight = createFilledIcon(CaretRightPhosphor);
export const ChevronRightIcon = ChevronRight;
export const CreditCard = createFilledIcon(CreditCardPhosphor);
export const CreditCardIcon = CreditCard;
export const FileText = createFilledIcon(FileTextPhosphor);
export const FileTextIcon = FileText;
export const History = createFilledIcon(ClockCounterClockwisePhosphor);
export const HistoryIcon = History;
export const Landmark = createFilledIcon(BankPhosphor);
export const LandmarkIcon = Landmark;
export const LayoutDashboard = createFilledIcon(SquaresFourPhosphor);
export const LayoutDashboardIcon = LayoutDashboard;
export const LogOut = createFilledIcon(SignOutPhosphor);
export const LogOutIcon = LogOut;
export const Mail = createFilledIcon(EnvelopeSimplePhosphor);
export const MailIcon = Mail;
export const MapPin = createFilledIcon(MapPinPhosphor);
export const MapPinIcon = MapPin;
export const Menu = createFilledIcon(ListPhosphor);
export const MenuIcon = Menu;
export const MonitorCog = createFilledIcon(DesktopTowerPhosphor);
export const MonitorCogIcon = MonitorCog;
export const Palette = createFilledIcon(PalettePhosphor);
export const PaletteIcon = Palette;
export const PencilLine = createFilledIcon(PencilSimpleLinePhosphor);
export const PencilLineIcon = PencilLine;
export const Phone = createFilledIcon(PhonePhosphor);
export const PhoneIcon = Phone;
export const Power = createFilledIcon(PowerPhosphor);
export const PowerIcon = Power;
export const ScrollText = createFilledIcon(ScrollPhosphor);
export const ScrollTextIcon = ScrollText;
export const Search = createFilledIcon(MagnifyingGlassPhosphor);
export const SearchIcon = Search;
export const Settings2 = createFilledIcon(GearSixPhosphor);
export const Settings2Icon = Settings2;
export const UserRound = createFilledIcon(UserCirclePhosphor);
export const UserRoundIcon = UserRound;
export const Wallet = createFilledIcon(WalletPhosphor);
export const WalletIcon = Wallet;
export const Layers = createFilledIcon(StackSimplePhosphor);
export const LayersIcon = Layers;
export const PlusCircle = createFilledIcon(PlusCirclePhosphor);
export const PlusCircleIcon = PlusCircle;
export const ListChecks = createFilledIcon(ListChecksPhosphor);
export const ListChecksFilledIcon = ListChecks;
export const FileBarChart2 = createFilledIcon(ChartBarPhosphor);
export const FileBarChart2Icon = FileBarChart2;
export const Trash2 = createFilledIcon(TrashPhosphor);
export const Trash2Icon = Trash2;
export const Flag = createFilledIcon(FlagPennantPhosphor);
export const FlagIcon = Flag;
export const X = createFilledIcon(XPhosphor);
export const CloseIcon = X;
