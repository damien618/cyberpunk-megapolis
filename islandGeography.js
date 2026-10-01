// Local scenes on one island. Sea is -Z in each playable sector.
export const ISLAND_SECTORS = Object.freeze({
  jungle: { name: 'La cascade', coast: 'sud', offset: [0, 0] },
  resort: { name: 'Village touristique', coast: 'ouest', offset: [-400, 0] },
  indigenous: { name: 'Village indigène', coast: 'est', offset: [400, 0], reserved: true },
});
export const JUNGLE_RESORT_GATE = Object.freeze({ x: -34, z: 18, r: 2.8 });
export const JUNGLE_RESORT_ARRIVAL = Object.freeze({ x: -30, z: 18, yaw: -Math.PI / 2 });
export function islandTime(value) { return ['day', 'sunset', 'night'].includes(value) ? value : 'day'; }
export function travelURL(map, arrival, time) {
  return `index.html?${new URLSearchParams({ map, arrival, time: islandTime(time) })}`;
}
