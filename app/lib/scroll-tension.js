// Shared by sidebar expansion and the pinned/snoozed section reveal.
export const scrollTension = {
    resistance: 0.08,
    threshold: 47,
    maxStretch: 50,
    activationThreshold: 180,
    reverseResistance: 0.3,
    decay: 0.4,
    rest: 0.3,
    delay: 80
}

export function stretchScrollTension (offset, delta) {
    return Math.min(offset + delta * scrollTension.resistance, scrollTension.maxStretch)
}

export function releaseScrollTension (offset) {
    const next = offset * scrollTension.decay
    return Math.abs(next) < scrollTension.rest ? 0 : next
}
