"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.table = exports.met = exports.Requirement = exports.Condition = void 0;
/**
 * A state the graph can name but not evaluate, such as `civ1-unit:coastal-city`: whether it holds depends on the map,
 * the city or the game, so a hand-written rule decides it. The entry gives the civilopedia a line to show for it.
 */
class Condition {
    constructor(id) {
        this.id = id;
    }
}
exports.Condition = Condition;
/**
 * One edge of the graph: `subject` `relation` `targets`, such as "Musketman requires Gunpowder". Entries are data:
 * what a ruleset says, kept where the civilopedia can read it and a plugin can change it. Play never reads them; it
 * runs the rules each entry was made into.
 *
 * An entry is frozen: a ruleset's are shared by every game, and the rules made from them read them as they run, so a
 * change to one would change play everywhere. A plugin changes an entry by replacing it in a game's registry.
 */
class Requirement {
    constructor({ id, subject, relation, targets, mode = 'all', range = 'player', where, }) {
        if (typeof id !== 'string' ||
            id === '' ||
            typeof subject !== 'function' ||
            !Array.isArray(targets)) {
            throw new TypeError(`A requirement needs an id, a subject class and a list of targets: '${id}' has not got them all.`);
        }
        this.id = id;
        this.subject = subject;
        this.relation = relation;
        this.targets = Object.freeze([...targets]);
        this.mode = mode;
        this.range = range;
        this.where = where ? Object.freeze([...where]) : null;
        Object.freeze(this);
    }
}
exports.Requirement = Requirement;
/**
 * Whether `entry`'s targets are met, given how to tell whether one target is: all of them, or any one. Whether being
 * met makes the subject available (`requires`) or not (`obsoletedBy`, `excludedBy`) is for the caller to say.
 */
const met = (entry, has) => entry.mode === 'any' ? entry.targets.some(has) : entry.targets.every(has);
exports.met = met;
/**
 * Entries from a table of rows, each a subject and its targets, with ids made from `idPrefix` and the subject's name:
 *
 * ```ts
 * table('civ1-unit:city/build/obsolete', 'obsoletedBy', [
 *   [Spearman, Gunpowder],
 *   [Musketman, Conscription],
 * ]);
 * // civ1-unit:city/build/obsolete/Spearman, civ1-unit:city/build/obsolete/Musketman
 * ```
 */
const table = (idPrefix, relation, rows, options = {}) => rows.map(([subject, ...targets]) => new Requirement({
    id: `${idPrefix}/${subject.name}`,
    subject,
    relation,
    targets,
    ...options,
}));
exports.table = table;
exports.default = Requirement;
//# sourceMappingURL=Requirement.js.map