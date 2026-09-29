/* Types (partiels) des réponses Navitia utilisées par RailHub. */

export type NavitiaDateTime = string; // YYYYMMDDTHHMMSS
export type NavitiaTime = string; // HHMMSS

export interface Coord {
  lon: string;
  lat: string;
}

export interface Code {
  type: string;
  value: string;
}

export interface LinkRef {
  id?: string;
  type: string;
  rel?: string;
  templated?: boolean;
  internal?: boolean;
  category?: string;
}

export interface Pagination {
  total_result: number;
  start_page: number;
  items_per_page: number;
  items_on_page: number;
}

export interface FeedPublisher {
  id: string;
  name: string;
  license?: string;
  url?: string;
}

export interface NavitiaContext {
  current_datetime?: NavitiaDateTime;
  timezone?: string;
}

export interface BaseResponse {
  pagination?: Pagination;
  links?: LinkRef[];
  disruptions?: Disruption[];
  feed_publishers?: FeedPublisher[];
  context?: NavitiaContext;
  error?: { id: string; message: string };
}

export interface GeoJsonLine {
  type: 'LineString' | 'MultiLineString';
  coordinates: number[][] | number[][][];
}

export interface AdministrativeRegion {
  id: string;
  name: string;
  label?: string;
  zip_code?: string;
  insee?: string;
  level?: number;
  coord?: Coord;
}

export interface CommercialMode {
  id: string;
  name: string;
}
export interface PhysicalMode {
  id: string;
  name: string;
  co2_emission_rate?: { value: number; unit: string };
}

export interface Network {
  id: string;
  name: string;
  codes?: Code[];
  links?: LinkRef[];
}

export interface Company {
  id: string;
  name: string;
  codes?: Code[];
}

export interface StopArea {
  id: string;
  name: string;
  label?: string;
  coord: Coord;
  codes?: Code[];
  timezone?: string;
  administrative_regions?: AdministrativeRegion[];
  lines?: Line[];
  commercial_modes?: CommercialMode[];
  physical_modes?: PhysicalMode[];
  links?: LinkRef[];
}

export interface Equipment {
  [k: string]: unknown;
}

export interface StopPoint {
  id: string;
  name: string;
  label?: string;
  coord: Coord;
  codes?: Code[];
  stop_area?: StopArea;
  equipments?: string[];
  administrative_regions?: AdministrativeRegion[];
  commercial_modes?: CommercialMode[];
  physical_modes?: PhysicalMode[];
  lines?: Line[];
  links?: LinkRef[];
}

export interface Line {
  id: string;
  name: string;
  code?: string;
  color?: string;
  text_color?: string;
  opening_time?: NavitiaTime;
  closing_time?: NavitiaTime;
  network?: Network;
  commercial_mode?: CommercialMode;
  physical_modes?: PhysicalMode[];
  routes?: Route[];
  codes?: Code[];
  geojson?: GeoJsonLine;
  links?: LinkRef[];
}

export interface Route {
  id: string;
  name: string;
  is_frequence?: string;
  direction_type?: string;
  direction?: Place;
  line?: Line;
  physical_modes?: PhysicalMode[];
  geojson?: GeoJsonLine;
  links?: LinkRef[];
}

export interface Poi {
  id: string;
  name: string;
  label?: string;
  coord: Coord;
  poi_type?: PoiType;
  address?: Address;
  properties?: Record<string, string>;
}

export interface PoiType {
  id: string;
  name: string;
}

export interface Address {
  id: string;
  name: string;
  label?: string;
  house_number?: number;
  coord: Coord;
  administrative_regions?: AdministrativeRegion[];
}

export type EmbeddedType =
  | 'stop_area'
  | 'stop_point'
  | 'address'
  | 'poi'
  | 'administrative_region'
  | 'line'
  | 'network'
  | 'route'
  | 'commercial_mode'
  | 'physical_mode'
  | 'company';

export interface Place {
  id: string;
  name: string;
  quality?: number;
  distance?: string;
  embedded_type: EmbeddedType;
  stop_area?: StopArea;
  stop_point?: StopPoint;
  address?: Address;
  poi?: Poi;
  administrative_region?: AdministrativeRegion;
}

export interface PtObject {
  id: string;
  name: string;
  quality?: number;
  embedded_type: EmbeddedType;
  stop_area?: StopArea;
  line?: Line;
  network?: Network;
  route?: Route;
  commercial_mode?: CommercialMode;
}

export interface PlacesResponse extends BaseResponse {
  places?: Place[];
}
export interface PtObjectsResponse extends BaseResponse {
  pt_objects?: PtObject[];
}
export interface PlacesNearbyResponse extends BaseResponse {
  places_nearby?: Place[];
}
export interface CoordResponse extends BaseResponse {
  address?: Address;
  regions?: string[];
}

/* ----------------------------- Horaires ----------------------------- */

export interface DisplayInformations {
  commercial_mode: string;
  physical_mode: string;
  network: string;
  code: string;
  name: string;
  label?: string;
  headsign: string;
  direction: string;
  color?: string;
  text_color?: string;
  trip_short_name?: string;
  description?: string;
  equipments?: string[];
  links?: LinkRef[];
}

export type DataFreshness = 'realtime' | 'base_schedule' | 'adapted_schedule';

export interface StopDateTime {
  departure_date_time?: NavitiaDateTime;
  base_departure_date_time?: NavitiaDateTime;
  arrival_date_time?: NavitiaDateTime;
  base_arrival_date_time?: NavitiaDateTime;
  data_freshness?: DataFreshness;
  additional_informations?: string[];
  links?: LinkRef[];
  stop_point?: StopPoint;
}

export interface Departure {
  display_informations: DisplayInformations;
  stop_point: StopPoint;
  route: Route;
  stop_date_time: StopDateTime;
  links?: LinkRef[];
}
export type Arrival = Departure;

export interface DeparturesResponse extends BaseResponse {
  departures?: Departure[];
}
export interface ArrivalsResponse extends BaseResponse {
  arrivals?: Arrival[];
}

export interface ScheduleDateTime {
  date_time: NavitiaDateTime | '';
  base_date_time?: NavitiaDateTime;
  data_freshness?: DataFreshness;
  additional_informations?: string[];
  links?: LinkRef[];
}

export interface StopSchedule {
  display_informations: DisplayInformations;
  stop_point: StopPoint;
  route: Route;
  date_times: ScheduleDateTime[];
  additional_informations?: string;
  first_datetime?: ScheduleDateTime;
  last_datetime?: ScheduleDateTime;
  links?: LinkRef[];
}
export interface StopSchedulesResponse extends BaseResponse {
  stop_schedules?: StopSchedule[];
}
export interface TerminusSchedulesResponse extends BaseResponse {
  terminus_schedules?: StopSchedule[];
}

export interface RouteScheduleRow {
  stop_point: StopPoint;
  date_times: ScheduleDateTime[];
}
export interface RouteScheduleHeader {
  display_informations: DisplayInformations;
  additional_informations?: string[];
  links?: LinkRef[];
}
export interface RouteSchedule {
  display_informations: DisplayInformations;
  table: { headers: RouteScheduleHeader[]; rows: RouteScheduleRow[] };
  additional_informations?: string;
  geojson?: GeoJsonLine;
  links?: LinkRef[];
}
export interface RouteSchedulesResponse extends BaseResponse {
  route_schedules?: RouteSchedule[];
}

/* ---------------------------- Itinéraires ---------------------------- */

export type SectionType =
  | 'public_transport'
  | 'street_network'
  | 'waiting'
  | 'transfer'
  | 'crow_fly'
  | 'on_demand_transport'
  | 'bss_rent'
  | 'bss_put_back'
  | 'boarding'
  | 'landing'
  | 'park'
  | 'leave_parking'
  | 'alighting';

export interface Section {
  id: string;
  type: SectionType;
  mode?: string;
  transfer_type?: string;
  duration: number;
  from?: Place;
  to?: Place;
  departure_date_time: NavitiaDateTime;
  arrival_date_time: NavitiaDateTime;
  base_departure_date_time?: NavitiaDateTime;
  base_arrival_date_time?: NavitiaDateTime;
  display_informations?: DisplayInformations;
  geojson?: { type: 'LineString'; coordinates: [number, number][]; properties?: { length: number }[] };
  stop_date_times?: StopDateTime[];
  co2_emission?: { value: number; unit: string };
  data_freshness?: DataFreshness;
  links?: LinkRef[];
}

export interface Journey {
  duration: number;
  nb_transfers: number;
  departure_date_time: NavitiaDateTime;
  arrival_date_time: NavitiaDateTime;
  requested_date_time?: NavitiaDateTime;
  type: string;
  status?: string;
  tags?: string[];
  co2_emission?: { value: number; unit: string };
  durations?: { total: number; walking: number; bike?: number; car?: number };
  distances?: { walking: number; bike?: number; car?: number };
  sections: Section[];
  fare?: { found: boolean; total?: { value: string; currency: string } };
  links?: LinkRef[];
}

export interface JourneysResponse extends BaseResponse {
  journeys?: Journey[];
}

export interface Isochrone {
  geojson: { type: 'MultiPolygon'; coordinates: number[][][][] };
  min_duration: number;
  max_duration: number;
  from?: Place;
  requested_date_time?: NavitiaDateTime;
}
export interface IsochronesResponse extends BaseResponse {
  isochrones?: Isochrone[];
}

export interface HeatMap {
  heat_matrix: {
    line_headers: { cell_lat: { min_lat: number; max_lat: number; center_lat: number } }[];
    lines: { cell_lon: { min_lon: number; max_lon: number; center_lon: number }; duration: (number | null)[] }[];
  };
  from?: Place;
}
export interface HeatMapsResponse extends BaseResponse {
  heat_maps?: HeatMap[];
}

/* --------------------------- Trains / VJ --------------------------- */

export interface VehicleJourneyStopTime {
  arrival_time: NavitiaTime;
  departure_time: NavitiaTime;
  utc_arrival_time?: NavitiaTime;
  utc_departure_time?: NavitiaTime;
  headsign?: string;
  stop_point: StopPoint;
  drop_off_allowed?: boolean;
  pickup_allowed?: boolean;
  skipped_stop?: boolean;
}

export interface Calendar {
  id?: string;
  name?: string;
  week_pattern?: Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', boolean>;
  active_periods?: { begin: string; end: string }[];
  exceptions?: { datetime: string; type: 'add' | 'remove' }[];
  validity_pattern?: { beginning_date: string; days: string };
}

export interface Trip {
  id: string;
  name: string;
}

export interface VehicleJourney {
  id: string;
  name: string;
  headsign?: string;
  trip?: Trip;
  journey_pattern?: { id: string; name: string; route?: Route };
  stop_times: VehicleJourneyStopTime[];
  calendars?: Calendar[];
  validity_pattern?: { beginning_date: string; days: string };
  disruptions?: LinkRef[];
  codes?: Code[];
  start_time?: NavitiaTime;
  links?: LinkRef[];
}
export interface VehicleJourneysResponse extends BaseResponse {
  vehicle_journeys?: VehicleJourney[];
}
export interface TripsResponse extends BaseResponse {
  trips?: Trip[];
}
export interface CalendarsResponse extends BaseResponse {
  calendars?: Calendar[];
}

/* --------------------------- Perturbations --------------------------- */

export type DisruptionEffect =
  | 'NO_SERVICE'
  | 'REDUCED_SERVICE'
  | 'SIGNIFICANT_DELAYS'
  | 'DETOUR'
  | 'ADDITIONAL_SERVICE'
  | 'MODIFIED_SERVICE'
  | 'OTHER_EFFECT'
  | 'UNKNOWN_EFFECT'
  | 'STOP_MOVED';

export interface ImpactedStop {
  stop_point: StopPoint;
  base_arrival_time?: NavitiaTime;
  base_departure_time?: NavitiaTime;
  amended_arrival_time?: NavitiaTime;
  amended_departure_time?: NavitiaTime;
  arrival_status?: 'added' | 'deleted' | 'delayed' | 'unchanged' | 'deleted_for_detour' | 'added_for_detour';
  departure_status?: 'added' | 'deleted' | 'delayed' | 'unchanged' | 'deleted_for_detour' | 'added_for_detour';
  stop_time_effect?: string;
  cause?: string;
  is_detour?: boolean;
}

export interface ImpactedObject {
  pt_object: PtObject & {
    trip?: Trip;
  };
  impacted_stops?: ImpactedStop[];
  impacted_section?: { from: PtObject; to: PtObject };
}

export interface Disruption {
  id: string;
  disruption_id?: string;
  impact_id?: string;
  status: 'past' | 'active' | 'future';
  cause?: string;
  category?: string;
  severity: { name: string; effect: DisruptionEffect; color?: string; priority?: number };
  messages?: { text: string; channel: { name: string; content_type?: string; types?: string[] } }[];
  application_periods: { begin: NavitiaDateTime; end: NavitiaDateTime }[];
  updated_at?: NavitiaDateTime;
  tags?: string[];
  impacted_objects?: ImpactedObject[];
  contributor?: string;
  uri?: string;
}

export interface DisruptionsResponse extends BaseResponse {
  disruptions?: Disruption[];
}

export interface TrafficReport {
  network: Network & { links?: LinkRef[] };
  lines?: (Line & { links?: LinkRef[] })[];
  stop_areas?: (StopArea & { links?: LinkRef[] })[];
  vehicle_journeys?: (VehicleJourney & { links?: LinkRef[] })[];
}
export interface TrafficReportsResponse extends BaseResponse {
  traffic_reports?: TrafficReport[];
}

export interface LineReport {
  line: Line & { links?: LinkRef[] };
  pt_objects?: (PtObject & { links?: LinkRef[] })[];
}
export interface LineReportsResponse extends BaseResponse {
  line_reports?: LineReport[];
}

export interface EquipmentDetail {
  id: string;
  name?: string;
  embedded_type: 'elevator' | 'escalator' | string;
  current_availability?: {
    status: 'available' | 'unavailable' | 'unknown';
    cause?: { label: string };
    effect?: { label: string };
    periods?: { begin: string; end: string }[];
    updated_at?: string;
  };
}
export interface EquipmentReport {
  line: Line;
  stop_area_equipments?: { stop_area: StopArea; equipment_details: EquipmentDetail[] }[];
}
export interface EquipmentReportsResponse extends BaseResponse {
  equipment_reports?: EquipmentReport[];
}

/* ----------------------------- Référentiel ----------------------------- */

export interface NetworksResponse extends BaseResponse {
  networks?: Network[];
}
export interface LinesResponse extends BaseResponse {
  lines?: Line[];
}
export interface RoutesResponse extends BaseResponse {
  routes?: Route[];
}
export interface StopPointsResponse extends BaseResponse {
  stop_points?: StopPoint[];
}
export interface StopAreasResponse extends BaseResponse {
  stop_areas?: StopArea[];
}
export interface CommercialModesResponse extends BaseResponse {
  commercial_modes?: CommercialMode[];
}
export interface PhysicalModesResponse extends BaseResponse {
  physical_modes?: PhysicalMode[];
}
export interface CompaniesResponse extends BaseResponse {
  companies?: Company[];
}
export interface PoisResponse extends BaseResponse {
  pois?: Poi[];
}
export interface PoiTypesResponse extends BaseResponse {
  poi_types?: PoiType[];
}

/* ------------------------------- Méta ------------------------------- */

export interface Region {
  id: string;
  name?: string;
  status: string;
  start_production_date: string;
  end_production_date: string;
  last_load_at?: string;
  dataset_created_at?: string;
  shape?: string;
  realtime_proxies?: unknown[];
  error?: { code: string; value: string };
}
export interface CoverageResponse extends BaseResponse {
  regions?: Region[];
}
export interface StatusResponse extends BaseResponse {
  status?: Region & {
    publication_date?: string;
    kraken_version?: string;
    data_version?: number;
    nb_threads?: number;
    is_realtime_loaded?: boolean;
    is_open_data?: boolean;
    is_open_service?: boolean;
    last_rt_data_loaded?: string;
    loaded?: boolean;
    realtime_contributors?: string[];
  };
}
export interface Dataset {
  id: string;
  description?: string;
  start_validation_date: string;
  end_validation_date: string;
  system?: string;
  realtime_level?: string;
  contributor?: Contributor;
}
export interface Contributor {
  id: string;
  name: string;
  license?: string;
  website?: string;
}
export interface DatasetsResponse extends BaseResponse {
  datasets?: Dataset[];
}
export interface ContributorsResponse extends BaseResponse {
  contributors?: Contributor[];
}
