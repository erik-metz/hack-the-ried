# One-time migration from stable sensor firmware

The stable sketch stores RadioLib state in `rak3112lw`. The dual-network lab
sketch uses an identity-bound namespace. On an existing TTN node, omitting this
migration can cause `DevNonce is too small` even though its root keys are correct.
Do not reset the server's nonce checks or erase device NVS.

This USB-only maintenance sketch reads the already provisioned dual TTN identity
from NVS, verifies the old RadioLib nonce and session buffers against that
identity and EU868 plan, and copies them only when their nonce state is strictly
newer than the destination. It checks readback, retains the source, and never
joins, sends radio traffic, or prints keys/session bytes. The partition table
matches the common lab images. A repeated run skips an equal/newer destination.

Build and upload using the same ESP32-S3 FQBN as `dual_build.py`. Observe
`MIGRATION verified` over USB; any ERROR must be resolved before continuing.
Then restore the exact saved common A image, preserving NVS. Do not rebuild A
when a delta bundle depends on its exact image hash. Verify TTN reception and
private activation after restoration. This migration requires the stored stable
buffers to be compatible with the installed RadioLib version; incompatible or
mismatched buffers are rejected without copying them.
