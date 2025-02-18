import { writable } from 'svelte/store';

export const userState = writable({
    id: 1,
    isActive: true,
    map: Array(10).fill(null).map(() => Array(10).fill(0))
});
