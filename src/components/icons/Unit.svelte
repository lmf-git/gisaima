<script>
    import HumanWarrior from './HumanWarrior.svelte';
    import HumanScout from './HumanScout.svelte';
    import GoblinWarrior from './GoblinWarrior.svelte';
    import GoblinScout from './GoblinScout.svelte';
    import ElfWarrior from './ElfWarrior.svelte';
    import ElfScout from './ElfScout.svelte';
    import FairyWarrior from './FairyWarrior.svelte';
    import FairyScout from './FairyScout.svelte';
    import DwarfWarrior from './DwarfWarrior.svelte';
    import DwarfScout from './DwarfScout.svelte';
    import Healer from './Healer.svelte';
    import Shaman from './Shaman.svelte';
    import SiegeEngineer from './SiegeEngineer.svelte';
    import HumanKnight from './HumanKnight.svelte';
    import ElfArcher from './ElfArcher.svelte';
    import DwarfDefender from './DwarfDefender.svelte';
    import GoblinRaider from './GoblinRaider.svelte';
    import FairyEnchanter from './FairyEnchanter.svelte';
    import EliteGuard from './EliteGuard.svelte';
    import SiegeRam from './SiegeRam.svelte';
    import MasterCraftsman from './MasterCraftsman.svelte';
    import ResourceGatherer from './ResourceGatherer.svelte';
    import Goblin from './Goblin.svelte';
    import Wolf from './Wolf.svelte';
    import Bandit from './Bandit.svelte';
    import Spider from './Spider.svelte';
    import Skeleton from './Skeleton.svelte';
    import Troll from './Troll.svelte';
    import Elemental from './Elemental.svelte';

    const { unitIconKey, extraClass = '' } = $props();
    
    const icons = {
        human_warrior: HumanWarrior,
        human_scout: HumanScout,
        goblin_warrior: GoblinWarrior,
        goblin_scout: GoblinScout,
        elf_warrior: ElfWarrior,
        elf_scout: ElfScout,
        fairy_warrior: FairyWarrior,
        fairy_scout: FairyScout,
        dwarf_warrior: DwarfWarrior,
        dwarf_scout: DwarfScout,
        healer: Healer,
        shaman: Shaman,
        siege_engineer: SiegeEngineer,
        human_knight: HumanKnight,
        elf_archer: ElfArcher,
        dwarf_defender: DwarfDefender,
        goblin_raider: GoblinRaider,
        fairy_enchanter: FairyEnchanter,
        elite_guard: EliteGuard,
        siege_ram: SiegeRam,
        master_craftsman: MasterCraftsman,
        resource_gatherer: ResourceGatherer,
        goblin: Goblin,
        wolf: Wolf,
        bandit: Bandit,
        spider: Spider,
        skeleton: Skeleton,
        troll: Troll,
        elemental: Elemental
    }

    const Icon = icons[unitIconKey?.toLowerCase()]
</script>

{ Icon }
