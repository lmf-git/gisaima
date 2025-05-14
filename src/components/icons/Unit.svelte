<script>
    import Player from './Player.svelte';
    import Sword from './Sword.svelte';
    import Boots from './Boots.svelte';
    import Axe from './Axe.svelte';
    import Dagger from './Dagger.svelte';
    import Blades from './Blades.svelte';
    import Eye from './Eye.svelte';
    import Thorn from './Thorn.svelte';
    import Wing from './Wing.svelte';
    import Hammer from './Hammer.svelte';
    import Pick from './Pick.svelte';
    import Cross from './Cross.svelte';
    import Staff from './Staff.svelte';
    import Gear from './Gear.svelte';
    import Shield from './Shield.svelte';
    import Bow from './Bow.svelte';
    import Pickaxe from './Pickaxe.svelte';

    const { unitIconKey, extraClass = '' } = $props();
    
    const icons = {
        player: Player,
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
