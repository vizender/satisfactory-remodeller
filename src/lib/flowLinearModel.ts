import { solve, type Constraint } from "yalps";

export type Expression = Map<number, number>;

export function expression(...terms: [number, number][]): Expression {
  const result = new Map<number, number>();
  for (const [variable, coefficient] of terms) {
    result.set(variable, (result.get(variable) ?? 0) + coefficient);
  }
  return result;
}

export function combine(...parts: Expression[]): Expression {
  return expression(...parts.flatMap((part) => [...part]));
}

export function negative(part: Expression): Expression {
  return expression(...[...part].map(([v, c]): [number, number] => [v, -c]));
}

/** Small continuous LP with successive objectives, each locked before the next.
 * This makes downstream priority exact, independent of the size/units of upstream targets.
 * Every variable is nonnegative; recipe ratios and conservation are hard constraints.
 */
export class FlowLinearModel {
  private variables = new Map<number, Map<number, number>>();
  private constraints = new Map<number, Constraint>();
  private values = new Map<number, number>();

  variable(): Expression {
    const id = this.variables.size;
    this.variables.set(id, new Map());
    return expression([id, 1]);
  }

  constrain(terms: Expression, bound: Constraint): void {
    const id = this.constraints.size;
    this.constraints.set(id, bound);
    for (const [v, c] of terms) this.variables.get(v)!.set(id, c);
  }

  value(terms: Expression): number {
    let value = 0;
    for (const [v, c] of terms) value += c * (this.values.get(v) ?? 0);
    return Math.abs(value) < 1e-8 ? 0 : value;
  }

  minimize(terms: Expression, lock = true): void {
    if (terms.size === 0) return;
    for (const [id, coefficients] of this.variables) {
      coefficients.set(-1, terms.get(id) ?? 0);
    }
    const result = solve(
      {
        direction: "minimize",
        objective: -1,
        constraints: this.constraints,
        variables: this.variables,
      },
      { precision: 1e-9, maxPivots: 20000 },
    );
    if (result.status !== "optimal") {
      throw new Error(`Flow solver: ${result.status}`);
    }
    this.values = new Map(result.variables);
    if (lock) {
      const optimum = this.value(terms);
      // Floating point simplex results can differ by a few ulps on a later pass.
      // A one-sided bound preserves priority without making the next LP infeasible.
      this.constrain(terms, {
        max: optimum === 0 ? 0 : optimum + 1e-8 * (1 + Math.abs(optimum)),
      });
    }
  }

  distance(terms: Expression, target: number): Expression {
    const above = this.variable();
    const below = this.variable();
    this.constrain(combine(terms, negative(above), below), { equal: target });
    return combine(above, below);
  }

  target(terms: Expression, target: number): void {
    this.minimize(this.distance(terms, target), false);
    this.constrain(terms, { equal: this.value(terms) });
  }
}
