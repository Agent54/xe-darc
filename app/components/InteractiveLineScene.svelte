<script>
    import { T } from '@threlte/core'
    import { tweened } from 'svelte/motion'
    import { cubicOut } from 'svelte/easing'
    import { onDestroy } from 'svelte'
    import * as THREE from 'three'
    
    let { 
        mouseX, 
        mouseY,
        grainOpacity = 1.0,
        grainAmount = 0.8,
        grainSize = 40.0,
        grainFlicker = 0.3,
        grainSpread = 1.0
    } = $props()
    
    // Create tweened values for smooth animations with slower, smoother response
    const curve1Position = tweened([0, 0, 0], { duration: 800, easing: cubicOut })
    const curve1Rotation = tweened([0, 0, 0], { duration: 1000, easing: cubicOut })
    const curve2Position = tweened([0, 0, 0], { duration: 900, easing: cubicOut })
    const curve2Rotation = tweened([0, 0, 0], { duration: 1100, easing: cubicOut })
    
    // Mouse velocity tracking with smoothing
    let prevMouseX = 0
    let prevMouseY = 0
    let mouseVelX = 0
    let mouseVelY = 0
    let mouseSpeed = 0
    let maxSpeed = 0
    
    // Add mouse position smoothing
    let smoothMouseX = 0
    let smoothMouseY = 0
    const smoothingFactor = 0.85 // Higher = more smoothing
    
    // Animation state
    let time = 0
    let baseTimeIncrement = 0.016
    let animationId
    let isAnimating = true
    
    // Reactive geometries that update with time
    let geometry1 = $state(null)
    let geometry2 = $state(null)
    
    // Film grain line material shader
    const filmGrainLineShader = {
        uniforms: {
            time: { value: 0 },
            opacity: { value: grainOpacity },
            grainAmount: { value: grainAmount },
            grainSize: { value: grainSize },
            flicker: { value: grainFlicker },
            grainSpread: { value: grainSpread }
        },
        vertexShader: `
            varying vec3 vPosition;
            varying vec2 vUv;
            
            void main() {
                vPosition = position;
                vUv = uv; // Use proper UV coordinates
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform float grainAmount;
            uniform float grainSize;
            uniform float flicker;
            uniform float grainSpread;
            varying vec3 vPosition;
            varying vec2 vUv;
            
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            
            float smoothNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f); // Smooth interpolation
                
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }
            
            float fbm(vec2 p, int octaves) {
                float value = 0.0;
                float amplitude = 0.5;
                for(int i = 0; i < 4; i++) {
                    if(i >= octaves) break;
                    value += amplitude * smoothNoise(p);
                    p *= 2.0;
                    amplitude *= 0.5;
                }
                return value;
            }
            
            void main() {
                // Use world position for grain that spreads beyond geometry surfaces
                vec2 worldPos = vPosition.xy;
                
                // Scale world position to create grain - larger grainSize = bigger individual grains
                vec2 baseUv = worldPos * (1.0 / max(grainSize * 0.01, 0.001));
                
                // Apply grain spread to control how far the grain extends
                vec2 uv = baseUv / grainSpread;
                
                // Very slow, stable time movement with flicker
                float slowTime = time * 0.5;
                float flickerTime = slowTime + sin(time * 10.0) * flicker * 0.1;
                
                // Multiple stable noise layers with grainAmount control
                float grain1 = fbm(uv * 4.0 + flickerTime * 0.3, 3);
                float grain2 = fbm(uv * 6.0 + flickerTime * 0.2 + vec2(10.0, 15.0), 2);
                float grain3 = fbm(uv * 8.0 + flickerTime * 0.1 + vec2(20.0, 25.0), 2);
                
                // Combine with gentle weighting, controlled by grainAmount
                float combinedGrain = (grain1 * 0.5 + grain2 * 0.3 + grain3 * 0.2) * grainAmount;
                
                // Very gentle density variation with grainAmount influence
                float density = fbm(uv * 2.0 + flickerTime * 0.1, 2) * 0.3 + 0.7;
                density = mix(0.5, density, grainAmount);
                
                // Smooth grain visibility with wide transitions
                float grainMask = smoothstep(0.2, 0.8, combinedGrain * density);
                
                // Add some very gentle larger-scale variation
                float largeMask = smoothstep(0.3, 0.7, fbm(uv * 1.5 + flickerTime * 0.05, 2));
                
                // Combine masks smoothly with grainAmount control
                float finalMask = mix(0.4, 1.0, grainMask * largeMask * grainAmount);
                
                // Base opacity to ensure visibility
                float baseAlpha = 0.3;
                
                // Final smooth alpha with flicker effect
                float flickerEffect = 1.0 + sin(time * 15.0 + uv.x * 10.0) * flicker * 0.2;
                float finalAlpha = (baseAlpha + finalMask * 0.6) * flickerEffect;
                
                // Stable color with grain influence
                vec3 color = vec3(1.0, 0.97, 0.93);
                color *= 0.95 + combinedGrain * 0.1;
                
                // Add subtle flicker to color
                color *= 1.0 + sin(time * 12.0 + uv.y * 8.0) * flicker * 0.05;
                
                gl_FragColor = vec4(color, finalAlpha * opacity);
            }
        `
    }
    
    let filmGrainMaterial1 = new THREE.ShaderMaterial({
        ...filmGrainLineShader,
        transparent: true,
        side: THREE.DoubleSide
    })
    
    let filmGrainMaterial2 = new THREE.ShaderMaterial({
        ...filmGrainLineShader,
        transparent: true,
        side: THREE.DoubleSide
    })
    
    // Set different opacity values for visual hierarchy
    filmGrainMaterial1.uniforms.opacity.value = grainOpacity * 0.9
    filmGrainMaterial2.uniforms.opacity.value = grainOpacity * 0.6
    
    function createTwistedCurveGeometry(radius, offsetY, timeOffset, rotDirection, curveType) {
        const points = []
        const segments = 80
        
        // Use mouse speed to affect curve complexity - much more subtle
        const speedMultiplier = 1 + mouseSpeed * 0.5  // Reduced from 2 to 0.5
        const mouseInfluence = mouseSpeed * 0.1        // Reduced from 0.5 to 0.1
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments
            const angle = t * Math.PI * 2
            
            let x, y, z
            
            if (curveType === 'figure8') {
                // Figure-8 twisted pattern with barely perceptible mouse influence
                const scale = radius + Math.sin(time * 0.6 * speedMultiplier + timeOffset) * (0.2 + mouseInfluence)
                const mouseDistortion = smoothMouseX * 0.03 + smoothMouseY * 0.025  // Use smoothed values, very minimal
                
                x = Math.sin(angle + time * 0.8 * rotDirection * speedMultiplier + mouseDistortion) * scale
                y = Math.sin(angle * 2 + time * 0.8 * rotDirection * speedMultiplier + smoothMouseX * 0.04) * scale * (0.5 + mouseSpeed * 0.1) + offsetY
                z = Math.cos(angle * 3 + time * 1.0 * speedMultiplier + timeOffset + smoothMouseY * 0.03) * (0.3 + mouseSpeed * 0.05)
                
                // Add twist influenced by mouse movement - barely noticeable
                const twist = angle * 2 + time * 1.2 * rotDirection * speedMultiplier + mouseVelX * 0.05
                const cosT = Math.cos(twist)
                const sinT = Math.sin(twist)
                const tempY = y
                y = tempY * cosT - z * sinT
                z = tempY * sinT + z * cosT
                
            } else {
                // Twisted torus/pretzel pattern with barely perceptible mouse influence
                const majorRadius = radius + Math.sin(time * 0.8 * speedMultiplier + timeOffset) * (0.15 + mouseInfluence)
                const minorRadius = 0.3 + Math.cos(time * 1.0 * speedMultiplier + timeOffset) * (0.1 + mouseSpeed * 0.05)
                
                const mouseWarp = smoothMouseX * 0.04 + smoothMouseY * 0.03  // Use smoothed values, very minimal
                
                x = (majorRadius + minorRadius * Math.cos(angle * 3 + time * 1.5 * rotDirection * speedMultiplier + mouseWarp)) * Math.cos(angle + time * 0.8 * rotDirection * speedMultiplier + smoothMouseY * 0.05)
                y = (majorRadius + minorRadius * Math.cos(angle * 3 + time * 1.5 * rotDirection * speedMultiplier + mouseWarp)) * Math.sin(angle + time * 0.8 * rotDirection * speedMultiplier + smoothMouseX * 0.05) * 0.6 + offsetY
                z = minorRadius * Math.sin(angle * 3 + time * 1.5 * rotDirection * speedMultiplier + timeOffset + mouseWarp) * (0.8 + mouseSpeed * 0.1)
                
                // Add additional twist influenced by mouse velocity - barely noticeable
                const twist = angle * 1.5 + time * 1.8 * rotDirection * speedMultiplier + mouseVelY * 0.08
                const cosT = Math.cos(twist)
                const sinT = Math.sin(twist)
                const tempX = x
                x = tempX * cosT - z * sinT
                z = tempX * sinT + z * cosT
            }
            
            points.push(new THREE.Vector3(x, y, z))
        }
        
        // Create smooth closed curve and convert to tube for thickness
        const curve = new THREE.CatmullRomCurve3(points, true)
        return new THREE.TubeGeometry(curve, 100, 0.025, 8, true) // radius 0.025 for visible thickness
    }
    
    function animate() {
        if (!isAnimating) return
        
        // Much more subtle dynamic time increment based on mouse speed
        const speedFactor = 1 + mouseSpeed * 0.3 // Reduced from 3 to 0.3 for subtle effect
        time += baseTimeIncrement * speedFactor
        
        // Update film grain shader time for both materials
        filmGrainMaterial1.uniforms.time.value = time
        filmGrainMaterial2.uniforms.time.value = time
        
        // Update geometries with different curve types
        geometry1 = createTwistedCurveGeometry(1.1, 0.2, 0, 1, 'figure8')
        geometry2 = createTwistedCurveGeometry(0.9, -0.2, Math.PI, -1, 'torus')
        
        animationId = requestAnimationFrame(animate)
    }
    
    // Update shader uniforms when props change
    $effect(() => {
        filmGrainMaterial1.uniforms.opacity.value = grainOpacity * 0.9
        filmGrainMaterial1.uniforms.grainAmount.value = grainAmount
        filmGrainMaterial1.uniforms.grainSize.value = grainSize
        filmGrainMaterial1.uniforms.flicker.value = grainFlicker
        filmGrainMaterial1.uniforms.grainSpread.value = grainSpread
        
        filmGrainMaterial2.uniforms.opacity.value = grainOpacity * 0.6
        filmGrainMaterial2.uniforms.grainAmount.value = grainAmount
        filmGrainMaterial2.uniforms.grainSize.value = grainSize
        filmGrainMaterial2.uniforms.flicker.value = grainFlicker
        filmGrainMaterial2.uniforms.grainSpread.value = grainSpread
    })

    // Enhanced mouse movement reactions with heavy smoothing
    let lastMouseUpdate = 0
    $effect(() => {
        const now = Date.now()
        
        // Apply heavy smoothing to mouse position
        smoothMouseX = smoothMouseX * smoothingFactor + mouseX * (1 - smoothingFactor)
        smoothMouseY = smoothMouseY * smoothingFactor + mouseY * (1 - smoothingFactor)
        
        // Calculate velocity using smoothed values with much smaller bounds
        const deltaX = smoothMouseX - prevMouseX
        const deltaY = smoothMouseY - prevMouseY
        
        // Very aggressive velocity clamping
        mouseVelX = Math.max(-0.02, Math.min(0.02, deltaX))
        mouseVelY = Math.max(-0.02, Math.min(0.02, deltaY))
        
        // Calculate speed with very tight bounds
        const rawSpeed = Math.sqrt(mouseVelX * mouseVelX + mouseVelY * mouseVelY)
        mouseSpeed = Math.min(rawSpeed, 0.01) // Much tighter cap
        
        // Track maximum speed for normalization with decay
        if (mouseSpeed > maxSpeed) {
            maxSpeed = mouseSpeed
        }
        
        // Normalize mouse speed with better bounds
        mouseSpeed = maxSpeed > 0 ? Math.min(mouseSpeed / Math.max(maxSpeed, 0.005), 1) : 0
        
        // Apply exponential decay to max speed
        maxSpeed *= 0.98
        
        // Ensure maxSpeed doesn't get too small
        if (maxSpeed < 0.005) {
            maxSpeed = 0.005
        }
        
        // Much less frequent updates for smoother animation
        if (now - lastMouseUpdate > 100) { // Only update every 100ms (10fps)
            // Extremely subtle reactions using smoothed mouse position
            const target1X = smoothMouseX * 0.08 + mouseVelX * 0.2  // Very gentle
            const target1Y = smoothMouseY * 0.06 + mouseVelY * 0.15
            const targetRot1Y = smoothMouseX * 0.02 + mouseVelX * 0.1
            const targetRot1X = smoothMouseY * 0.015 + mouseVelY * 0.08
            
            const target2X = smoothMouseX * 0.05 + mouseVelX * 0.15
            const target2Y = smoothMouseY * 0.07 + mouseVelY * 0.2  
            const targetRot2Y = smoothMouseX * 0.015 + mouseVelX * 0.08
            const targetRot2X = smoothMouseY * 0.025 + mouseVelY * 0.12
            
            // Barely perceptible speed influence
            const speedRotation = mouseSpeed * 0.005
            
            curve1Position.set([target1X, target1Y, mouseSpeed * 0.05])
            curve1Rotation.set([targetRot1X, targetRot1Y, time * (0.04 + speedRotation)])
            
            curve2Position.set([target2X, target2Y, -mouseSpeed * 0.03])
            curve2Rotation.set([targetRot2X, targetRot2Y, -time * (0.03 + speedRotation)])
            
            lastMouseUpdate = now
        }
        
        // Store previous smoothed mouse position
        prevMouseX = smoothMouseX
        prevMouseY = smoothMouseY
    })
    
    // Initialize geometries and start animation
    geometry1 = createTwistedCurveGeometry(1.1, 0.2, 0, 1, 'figure8')
    geometry2 = createTwistedCurveGeometry(0.9, -0.2, Math.PI, -1, 'torus')
    animate()
    
    // Cleanup
    onDestroy(() => {
        isAnimating = false
        if (animationId) {
            cancelAnimationFrame(animationId)
        }
        filmGrainMaterial1.dispose()
        filmGrainMaterial2.dispose()
    })
</script>

<T.PerspectiveCamera makeDefault fov={50} position={[0, 0, 5]} />

<T.AmbientLight intensity={0.2} />

<!-- First bezier curve - Figure-8 with twist -->
{#if geometry1}
    <T.Group position={$curve1Position} rotation={$curve1Rotation}>
        <T.Mesh geometry={geometry1}>
            <T.ShaderMaterial
                uniforms={filmGrainMaterial1.uniforms}
                vertexShader={filmGrainMaterial1.vertexShader}
                fragmentShader={filmGrainMaterial1.fragmentShader}
                transparent={true}
                side={THREE.DoubleSide}
            />
        </T.Mesh>
    </T.Group>
{/if}

<!-- Second bezier curve - Twisted torus -->
{#if geometry2}
    <T.Group position={$curve2Position} rotation={$curve2Rotation}>
        <T.Mesh geometry={geometry2}>
            <T.ShaderMaterial
                uniforms={filmGrainMaterial2.uniforms}
                vertexShader={filmGrainMaterial2.vertexShader}
                fragmentShader={filmGrainMaterial2.fragmentShader}
                transparent={true}
                side={THREE.DoubleSide}
            />
        </T.Mesh>
    </T.Group>
{/if}

<!-- Cloud of grain particles spread throughout the scene -->
{#each Array(200) as _, i}
    {@const angle1 = (i / 200) * Math.PI * 8}
    {@const angle2 = (i / 200) * Math.PI * 6}
    {@const radius = 0.5 + (i % 10) * 0.3}
    {@const height = ((i % 20) - 10) * 0.2}
    <T.Mesh position={[
        Math.sin(angle1 + time * 0.2) * radius + Math.cos(i * 0.1 + time * 0.3) * 0.5,
        Math.cos(angle2 + time * 0.15) * radius * 0.6 + height + Math.sin(i * 0.05 + time * 0.2) * 0.3,
        Math.sin(angle1 * 0.7 + time * 0.25) * 0.8 + Math.cos(i * 0.03 + time * 0.1) * 0.4
    ]}>
        <T.SphereGeometry args={[0.003 + (i % 5) * 0.001]} />
        <T.ShaderMaterial
            uniforms={filmGrainMaterial2.uniforms}
            vertexShader={filmGrainMaterial2.vertexShader}
            fragmentShader={filmGrainMaterial2.fragmentShader}
            transparent={true}
            side={THREE.DoubleSide}
        />
    </T.Mesh>
{/each}

<!-- Speed-reactive particles with film grain -->
{#each Array(8) as _, i}
    <T.Mesh position={[
        Math.sin(i * Math.PI / 4 + time * (0.6 + mouseSpeed)) * (1.4 + mouseSpeed * 0.8), 
        Math.cos(i * Math.PI / 4 + time * (0.5 + mouseSpeed)) * (0.8 + mouseSpeed * 0.4),
        Math.sin(i * 0.8 + time * (0.8 + mouseSpeed * 2)) * (0.3 + mouseSpeed * 0.3)
    ]}>
        <T.SphereGeometry args={[0.006 + mouseSpeed * 0.004]} />
        <T.ShaderMaterial
            uniforms={filmGrainMaterial1.uniforms}
            vertexShader={filmGrainMaterial1.vertexShader}
            fragmentShader={filmGrainMaterial1.fragmentShader}
            transparent={true}
            side={THREE.DoubleSide}
        />
    </T.Mesh>
{/each} 