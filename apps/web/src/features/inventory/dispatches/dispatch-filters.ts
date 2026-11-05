import type { Dispatch } from '@oneohm/api-contracts';
import { matchesSearch } from '@/lib/use-search-param';

/** A challan matching the search: number, project, vehicle, driver, contractor, items or serials. */
export function matchesDispatch(search: string, dispatch: Dispatch): boolean {
  return matchesSearch(search, [
    dispatch.number,
    dispatch.projectCode,
    dispatch.projectName,
    dispatch.locationName,
    dispatch.vehicle,
    dispatch.driverName,
    dispatch.driverPhone,
    dispatch.contractor?.name,
    dispatch.notes,
    ...dispatch.lines.flatMap((line) => [line.name, ...line.serials]),
  ]);
}
