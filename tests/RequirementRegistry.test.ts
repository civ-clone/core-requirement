import { Condition, Requirement, Target, met, table } from '../Requirement';
import {
  Deriver,
  DuplicateRequirementIdError,
  RequirementRegistry,
  UnknownRequirementError,
} from '../RequirementRegistry';
import Criterion from '@civ-clone/core-rule/Criterion';
import Effect from '@civ-clone/core-rule/Effect';
import Rule from '@civ-clone/core-rule/Rule';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import { expect } from 'chai';

class Advance {}
class Bronze extends Advance {}
class Iron extends Advance {}
class Gunpowder extends Advance {}

class Unit {}
class Naval extends Unit {}
class Trireme extends Naval {}
class Spearman extends Unit {}
class Musketman extends Unit {}

// A rule saying whether a player knowing `known` may build an item: `true` when the rule passes.
class Buildable extends Rule<[Function, Function[]], boolean> {}

// Makes, for each entry, one rule under the entry's id, as a ruleset's deriver would.
const toBuildable: Deriver = (entry: Requirement): Rule[] =>
  entry.relation === 'replacedBy'
    ? []
    : [
        new Buildable(
          entry.id,
          new Criterion((Item: Function): boolean => Item === entry.subject),
          new Effect((Item: Function, known: Function[]): boolean => {
            const isMet = met(entry, (target: Target): boolean =>
              known.includes(target as Function)
            );

            return entry.relation === 'obsoletedBy' ? !isMet : isMet;
          })
        ),
      ];

// Whether every rule about `Item` passes for a player knowing `known`.
const canBuild = (
  rules: RuleRegistry,
  Item: Function,
  known: Function[]
): boolean =>
  rules
    .process(Buildable, Item, known)
    .every((result: boolean): boolean => result);

const entries = (): Requirement[] => [
  ...table('test:build/requires', 'requires', [
    [Spearman, Bronze],
    [Musketman, Gunpowder],
  ]),
  ...table('test:build/obsolete', 'obsoletedBy', [[Spearman, Gunpowder]]),
  ...table('test:unit/replaced-by', 'replacedBy', [[Spearman, Musketman]]),
];

describe('table', (): void => {
  it('makes an entry per row, its id from the prefix and the subject', (): void => {
    const [spearman, musketman] = table(
      'test:build/requires',
      'requires',
      [
        [Spearman, Bronze, Iron],
        [Musketman, Gunpowder],
      ],
      { range: 'world', mode: 'any' }
    );

    expect(spearman.id).equal('test:build/requires/Spearman');
    expect(spearman.subject).equal(Spearman);
    expect(spearman.targets).eql([Bronze, Iron]);
    expect(spearman.relation).equal('requires');
    expect(spearman.mode).equal('any');
    expect(spearman.range).equal('world');
    expect(musketman.id).equal('test:build/requires/Musketman');
  });

  it("defaults to all of the targets, the player's", (): void => {
    const [entry] = table('test:x', 'requires', [[Spearman, Bronze]]);

    expect(entry.mode).equal('all');
    expect(entry.range).equal('player');
    expect(entry.where).equal(null);
  });
});

describe('met', (): void => {
  const has = (target: Target): boolean => target === Bronze;

  it('needs every target, or any one', (): void => {
    const [all] = table('test:all', 'requires', [[Spearman, Bronze, Iron]]),
      [any] = table('test:any', 'requires', [[Spearman, Bronze, Iron]], {
        mode: 'any',
      });

    expect(met(all, has)).false;
    expect(met(any, has)).true;
  });
});

describe('RequirementRegistry', (): void => {
  let rules: RuleRegistry, requirements: RequirementRegistry;

  beforeEach((): void => {
    rules = new RuleRegistry();
    requirements = new RequirementRegistry(rules);

    requirements.add(toBuildable, ...entries());
  });

  it('registers one rule per entry, under its id, in order, and none for an entry that only says', (): void => {
    expect(rules.entries().map((rule: Rule): string | null => rule.id())).eql([
      'test:build/requires/Spearman',
      'test:build/requires/Musketman',
      'test:build/obsolete/Spearman',
    ]);
    expect(requirements.rulesFor('test:unit/replaced-by/Spearman')).eql([]);
    expect(requirements.rulesFor('test:build/requires/Spearman')).eql([
      rules.getById('test:build/requires/Spearman'),
    ]);
  });

  it('plays as the table says', (): void => {
    expect(canBuild(rules, Spearman, [])).false;
    expect(canBuild(rules, Spearman, [Bronze])).true;
    expect(canBuild(rules, Spearman, [Bronze, Gunpowder])).false;
    expect(canBuild(rules, Musketman, [Gunpowder])).true;
  });

  it('reads the graph both ways', (): void => {
    expect(
      requirements.for(Spearman).map((entry: Requirement) => entry.id)
    ).eql([
      'test:build/requires/Spearman',
      'test:build/obsolete/Spearman',
      'test:unit/replaced-by/Spearman',
    ]);
    expect(
      requirements
        .for(Spearman, 'obsoletedBy')
        .map((entry: Requirement) => entry.id)
    ).eql(['test:build/obsolete/Spearman']);
    expect(
      requirements.leadsTo(Gunpowder).map((entry: Requirement) => entry.id)
    ).eql(['test:build/requires/Musketman', 'test:build/obsolete/Spearman']);
    expect(
      requirements
        .leadsTo(Musketman, 'replacedBy')
        .map((entry: Requirement) => entry.id)
    ).eql(['test:unit/replaced-by/Spearman']);
    expect(
      requirements.getById('test:build/requires/Musketman')?.subject
    ).equal(Musketman);
    expect(requirements.getById('test:nothing')).equal(null);
  });

  it("counts an entry on a superclass, and names a condition the graph can't decide", (): void => {
    const coastal = new Condition('test:coastal-city');

    requirements.add(
      null,
      new Requirement({
        id: 'test:build/naval-needs-coast',
        subject: Naval,
        relation: 'requires',
        targets: [coastal],
        range: 'city',
      })
    );

    expect(requirements.for(Trireme).map((entry: Requirement) => entry.id)).eql(
      ['test:build/naval-needs-coast']
    );
    expect(
      requirements
        .leadsTo(new Condition('test:coastal-city'))
        .map((entry: Requirement) => entry.id)
    ).eql(['test:build/naval-needs-coast']);
    expect(rules.getById('test:build/naval-needs-coast')).equal(null);
    expect(requirements.for(Spearman).length).equal(3);
  });

  it('replaces an entry and its rule together', (): void => {
    requirements.replace(
      'test:build/requires/Musketman',
      ...table('test:build/requires', 'requires', [
        [Musketman, Gunpowder, Iron],
      ])
    );

    expect(canBuild(rules, Musketman, [Gunpowder])).false;
    expect(canBuild(rules, Musketman, [Gunpowder, Iron])).true;
    expect(requirements.getById('test:build/requires/Musketman')?.targets).eql([
      Gunpowder,
      Iron,
    ]);
    expect(
      rules.filter(
        (rule: Rule): boolean => rule.id() === 'test:build/requires/Musketman'
      ).length
    ).equal(1);
  });

  it('removes an entry and its rule together', (): void => {
    requirements.remove('test:build/obsolete/Spearman');

    expect(canBuild(rules, Spearman, [Bronze, Gunpowder])).true;
    expect(requirements.getById('test:build/obsolete/Spearman')).equal(null);
    expect(rules.getById('test:build/obsolete/Spearman')).equal(null);
    expect(
      requirements.for(Spearman).map((entry: Requirement) => entry.id)
    ).eql(['test:build/requires/Spearman', 'test:unit/replaced-by/Spearman']);
  });

  it('takes a plain object as an entry, as a plugin might write one', (): void => {
    const existing = requirements.getById('test:build/requires/Musketman')!;

    requirements.replace('test:build/requires/Musketman', {
      id: existing.id,
      subject: existing.subject,
      relation: existing.relation,
      targets: [Gunpowder, Iron],
    });

    expect(requirements.getById(existing.id)).instanceOf(Requirement);
    expect(canBuild(rules, Musketman, [Gunpowder])).false;
    expect(canBuild(rules, Musketman, [Gunpowder, Iron])).true;
  });

  it("owns its rules' ids: removing or replacing it takes out a plugin's rule put in their place", (): void => {
    rules.replace(
      'test:build/obsolete/Spearman',
      new Buildable(
        'test:build/obsolete/Spearman',
        new Effect((): boolean => false)
      )
    );
    requirements.replace(
      'test:build/obsolete/Spearman',
      ...table('test:build/obsolete', 'obsoletedBy', [[Spearman, Iron]])
    );

    expect(
      rules.filter(
        (rule: Rule): boolean => rule.id() === 'test:build/obsolete/Spearman'
      )
    ).eql(requirements.rulesFor('test:build/obsolete/Spearman'));
    expect(canBuild(rules, Spearman, [Bronze])).true;
    expect(canBuild(rules, Spearman, [Bronze, Iron])).false;

    rules.replace(
      'test:build/obsolete/Spearman',
      new Buildable(
        'test:build/obsolete/Spearman',
        new Effect((): boolean => false)
      )
    );
    requirements.remove('test:build/obsolete/Spearman');

    expect(rules.getById('test:build/obsolete/Spearman')).equal(null);
    expect(canBuild(rules, Spearman, [Bronze, Iron])).true;
  });

  it('leaves everything as it was when a change is refused', (): void => {
    const before = () => [
      requirements.entries().map((entry: Requirement) => entry.id),
      rules.entries().map((rule: Rule) => rule.id()),
    ];
    const snapshot = before();

    // Two replacements under one id.
    expect((): void =>
      requirements.replace(
        'test:build/requires/Musketman',
        ...table('test:build/requires', 'requires', [
          [Musketman, Iron],
          [Musketman, Bronze],
        ])
      )
    ).throw(DuplicateRequirementIdError);
    // A rule id another rule already has.
    rules.register(new Buildable('test:taken/Trireme', new Effect(() => true)));
    snapshot[1].push('test:taken/Trireme');
    expect((): void =>
      requirements.add(
        toBuildable,
        ...table('test:taken', 'requires', [[Trireme, Iron]])
      )
    ).throw(/already has/);
    // Something that is not an entry at all.
    expect((): void =>
      requirements.replace('test:build/requires/Musketman', {} as any)
    ).throw(TypeError, /needs an id, a subject class and a list of targets/);

    expect(before()).eql(snapshot);
    expect(canBuild(rules, Musketman, [Gunpowder])).true;
  });

  it('unregisters the entries it holds, by identity, and ignores the others', (): void => {
    const [lookalike] = table('test:build/requires', 'requires', [
      [Spearman, Bronze],
    ]);

    requirements.unregister(lookalike);

    expect(requirements.getById('test:build/requires/Spearman')).not.equal(
      null
    );

    requirements.unregister(
      requirements.getById('test:build/requires/Spearman')!
    );

    expect(requirements.getById('test:build/requires/Spearman')).equal(null);
    expect(rules.getById('test:build/requires/Spearman')).equal(null);
  });

  it('holds entries that cannot be changed in place', (): void => {
    const entry = requirements.getById('test:build/requires/Musketman')!;

    expect(Object.isFrozen(entry)).true;
    expect(Object.isFrozen(entry.targets)).true;
    expect((): void => {
      (entry.targets as Target[]).push(Iron);
    }).throw(TypeError);
  });

  it('refuses an id it already holds, or two at once', (): void => {
    expect((): void =>
      requirements.add(
        toBuildable,
        ...table('test:build/requires', 'requires', [[Spearman, Iron]])
      )
    ).throw(DuplicateRequirementIdError);
    expect((): void =>
      requirements.add(
        toBuildable,
        ...table('test:other', 'requires', [
          [Trireme, Iron],
          [Trireme, Bronze],
        ])
      )
    ).throw(DuplicateRequirementIdError);
    expect(requirements.getById('test:other/Trireme')).equal(null);
  });

  it('refuses an id it does not hold, as a mistyped plugin should be', (): void => {
    expect((): void =>
      requirements.remove('test:build/requires/Spaerman')
    ).throw(UnknownRequirementError);
    expect((): void =>
      requirements.replace('test:build/requires/Spaerman')
    ).throw(UnknownRequirementError);
  });

  it("finds a subject's entries and its superclasses' in the order they were added, and forgets removed ones", (): void => {
    requirements.add(
      null,
      ...table('test:a', 'requires', [[Trireme, Iron]]),
      ...table('test:b', 'requires', [[Naval, Bronze]]),
      ...table('test:c', 'obsoletedBy', [[Trireme, Gunpowder]]),
      ...table('test:d', 'requires', [[Unit, Bronze]])
    );

    expect(requirements.for(Trireme).map((entry: Requirement) => entry.id)).eql(
      ['test:a/Trireme', 'test:b/Naval', 'test:c/Trireme', 'test:d/Unit']
    );
    expect(
      requirements
        .for(Trireme, 'requires')
        .map((entry: Requirement) => entry.id)
    ).eql(['test:a/Trireme', 'test:b/Naval', 'test:d/Unit']);

    requirements.remove('test:b/Naval');

    expect(requirements.for(Trireme).map((entry: Requirement) => entry.id)).eql(
      ['test:a/Trireme', 'test:c/Trireme', 'test:d/Unit']
    );
    expect(requirements.for(Naval).map((entry: Requirement) => entry.id)).eql([
      'test:d/Unit',
    ]);
  });

  it('says which rule registry it makes rules in', (): void => {
    expect(requirements.ruleRegistry()).equal(rules);
  });

  it('keeps its own rules apart from another game', (): void => {
    const otherRules = new RuleRegistry(),
      other = new RequirementRegistry(otherRules);

    other.add(
      toBuildable,
      ...table('test:build/requires', 'requires', [[Spearman, Iron]])
    );

    expect(canBuild(otherRules, Spearman, [Iron])).true;
    expect(canBuild(rules, Spearman, [Iron])).false;
  });
});
