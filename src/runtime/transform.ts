import { Vec3 } from "../types/core";

export type Mat4 = number[]; // 16 valeurs, row-major

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function mat4Identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

/** Multiplication row-major: C = A * B */
export function mat4Mul(A: Mat4, B: Mat4): Mat4 {
  const C = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      C[r * 4 + c] =
        A[r * 4 + 0] * B[0 * 4 + c] +
        A[r * 4 + 1] * B[1 * 4 + c] +
        A[r * 4 + 2] * B[2 * 4 + c] +
        A[r * 4 + 3] * B[3 * 4 + c];
    }
  }
  return C;
}

export function mat4Translate(t: Vec3): Mat4 {
  return [
    1, 0, 0, t.x,
    0, 1, 0, t.y,
    0, 0, 1, t.z,
    0, 0, 0, 1,
  ];
}

export function mat4RotX(deg: number): Mat4 {
  const a = degToRad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    1, 0, 0, 0,
    0, c, -s, 0,
    0, s,  c, 0,
    0, 0, 0, 1,
  ];
}

export function mat4RotY(deg: number): Mat4 {
  const a = degToRad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
     c, 0, s, 0,
     0, 1, 0, 0,
    -s, 0, c, 0,
     0, 0, 0, 1,
  ];
}

export function mat4RotZ(deg: number): Mat4 {
  const a = degToRad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    c, -s, 0, 0,
    s,  c, 0, 0,
    0,  0, 1, 0,
    0,  0, 0, 1,
  ];
}

/**
 * Matrice de rotation Euler dans l'ordre EXACT: X puis Y puis Z.
 * Donc: R = Rz * Ry * Rx appliqué à un vecteur colonne,
 * ici on est en row-major et on applique via mat4ApplyToPoint.
 *
 * Pour rester cohérent avec notre convention row-major et apply (x,y,z,1) en "colonne",
 * on construit: M = T * Rz * Ry * Rx
 */
export function mat4FromTR_XYZ(translation: Vec3, rotXYZdeg: Vec3): Mat4 {
  const Rx = mat4RotX(rotXYZdeg.x);
  const Ry = mat4RotY(rotXYZdeg.y);
  const Rz = mat4RotZ(rotXYZdeg.z);

  // rotation ordre X->Y->Z = appliquer Rx puis Ry puis Rz
  // donc matrice finale rotation = Rz * Ry * Rx
  const R = mat4Mul(mat4Mul(Rz, Ry), Rx);
  const T = mat4Translate(translation);

  // Transform complet: M = T * R
  return mat4Mul(T, R);
}

/** Applique Mat4 à un point (x,y,z,1) */
export function mat4ApplyToPoint(M: Mat4, p: Vec3): Vec3 {
  const x = M[0] * p.x + M[1] * p.y + M[2] * p.z + M[3];
  const y = M[4] * p.x + M[5] * p.y + M[6] * p.z + M[7];
  const z = M[8] * p.x + M[9] * p.y + M[10] * p.z + M[11];
  return { x, y, z };
}

/** Addition Euler simple (pour garder le même comportement que ton C++ si c’était “add”) */
export function addEuler(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
