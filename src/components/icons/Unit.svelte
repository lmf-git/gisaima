<script>
    import HumanWarrior from './units/HumanWarrior.svelte';
    import HumanScout from './units/HumanScout.svelte';
    import GoblinWarrior from './units/GoblinWarrior.svelte';
    import GoblinScout from './units/GoblinScout.svelte';
    import ElfWarrior from './units/ElfWarrior.svelte';
    import ElfScout from './units/ElfScout.svelte';
    import FairyWarrior from './units/FairyWarrior.svelte';
    import FairyScout from './units/FairyScout.svelte';
    import DwarfWarrior from './units/DwarfWarrior.svelte';
    import DwarfScout from './units/DwarfScout.svelte';
    import Healer from './units/Healer.svelte';
    import Shaman from './units/Shaman.svelte';
    import SiegeEngineer from './units/SiegeEngineer.svelte';
    import HumanKnight from './units/HumanKnight.svelte';
    import ElfArcher from './units/ElfArcher.svelte';
    import DwarfDefender from './units/DwarfDefender.svelte';
    import GoblinRaider from './units/GoblinRaider.svelte';
    import FairyEnchanter from './units/FairyEnchanter.svelte';
    import EliteGuard from './units/EliteGuard.svelte';
    import SiegeRam from './units/SiegeRam.svelte';
    import MasterCraftsman from './units/MasterCraftsman.svelte';
    import ResourceGatherer from './units/ResourceGatherer.svelte';
    import Goblin from './units/Goblin.svelte';
    import Wolf from './units/Wolf.svelte';
    import Bandit from './units/Bandit.svelte';
    import Spider from './units/Spider.svelte';
    import Skeleton from './units/Skeleton.svelte';
    import Troll from './units/Troll.svelte';
    import Elemental from './units/Elemental.svelte';

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
