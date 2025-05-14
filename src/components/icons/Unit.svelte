<script>
    import Sword from './icons/Sword.svelte';
    import Boots from './icons/Boots.svelte';
    import Axe from './icons/Axe.svelte';
    import Dagger from './icons/Dagger.svelte';
    import Blades from './icons/Blades.svelte';
    import Eye from './icons/Eye.svelte';
    import Thorn from './icons/Thorn.svelte';
    import Wing from './icons/Wing.svelte';
    import Hammer from './icons/Hammer.svelte';
    import Pick from './icons/Pick.svelte';
    import Cross from './icons/Cross.svelte';
    import Staff from './icons/Staff.svelte';
    import Gear from './icons/Gear.svelte';
    import Shield from './icons/Shield.svelte';
    import Bow from './icons/Bow.svelte';
    import Pickaxe from './icons/Pickaxe.svelte';

    const { unitIconKey, extraClass = '' } = $props();
    
    const icons = {
        sword: Sword,
        boots: Boots,
        axe: Axe,
        dagger: Dagger,
        blades: Blades,
        eye: Eye,
        thorn: Thorn,
        wing: Wing,
        hammer: Hammer,
        pick: Pick,
        cross: Cross,
        staff: Staff,
        gear: Gear,
        shield: Shield,
        bow: Bow,
        pickaxe: Pickaxe
    }

    const Icon = icons[unitIconKey?.toLowerCase()]
</script>

{ Icon }
