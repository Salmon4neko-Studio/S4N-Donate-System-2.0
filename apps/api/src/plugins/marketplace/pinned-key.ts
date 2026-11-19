/**
 * Official registry Ed25519 public key (SPKI, base64).
 * The private key is not in this repository. Replacing the index requires
 * this pin to change in the same reviewed commit, or a signature from the
 * matching private key held outside the tree.
 *
 * This pin was rotated in the same commit as the alerts and chat manifests,
 * because the previous private key is not in the tree. Replace it with the
 * owner's key, and re-sign official.json, before production.
 */
export const OFFICIAL_REGISTRY_PUBLIC_KEY = "MCowBQYDK2VwAyEAY/hOooufKBrhMPsoSa3T6yY8OApWTu/hC3NDlU41GFc=";
