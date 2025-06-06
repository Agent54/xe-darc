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
        grainSpread = 1.0,
        animationSpeed = 1.0,
        lineThickness = 0.025,
        audioLevel = 0,
        audioFrequency = 0
    } = $props()
    
    // Smooth audio values to prevent stuttering
    let smoothAudioLevel = $state(0)
    let smoothAudioFrequency = $state(0)
    
    // Create tweened values for smooth animations with responsive movement
    const curve1Position = tweened([0, 0, 0], { duration: 400, easing: cubicOut })
    const curve1Rotation = tweened([0, 0, 0], { duration: 500, easing: cubicOut })
    const curve2Position = tweened([0, 0, 0], { duration: 450, easing: cubicOut })
    const curve2Rotation = tweened([0, 0, 0], { duration: 550, easing: cubicOut })
    
    // Mouse velocity tracking with smoothing
    let prevMouseX = 0
    let prevMouseY = 0
    let mouseVelX = 0
    let mouseVelY = 0
    let mouseSpeed = $state(0)
    
    // Add mouse position smoothing
    let smoothMouseX = $state(0)
    let smoothMouseY = $state(0)
    
    // Animation state
    let time = $state(0)
    let baseTimeIncrement = 0.016
    let animationId
    let isAnimating = true
    let frameCount = 0
    
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
        
        // Use audio to affect curve complexity (mouse speed handled globally in animate function)
        const audioMultiplier = 1 + smoothAudioLevel * 1.5 + smoothAudioFrequency * 0.05  // Increased audio impact for more responsiveness
        const speedMultiplier = 1 + smoothAudioLevel * 2  // Increased speed up with audio
        const mouseInfluence = mouseSpeed * 0.8 + smoothAudioLevel * 0.4      // Increased audio influence on shape
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments
            const angle = t * Math.PI * 2
            
            let x, y, z
            
            if (curveType === 'figure8') {
                // Figure-8 pattern that responds to mouse and audio
                const audioScale = 1 + smoothAudioLevel * 0.8  // Increased audio scale impact for more visual response
                const scale = radius * audioScale + Math.sin(time * 0.6 * speedMultiplier + timeOffset) * (0.2 + mouseInfluence)
                const mouseDistortion = smoothMouseX * 0.3 + smoothMouseY * 0.2  // Strong mouse influence
                const audioDistortion = Math.sin(smoothAudioFrequency * 2) * smoothAudioLevel * 0.3  // Added frequency distortion back
                
                // Curves bend towards mouse position and react to audio
                x = Math.sin(angle + time * 0.8 * rotDirection * speedMultiplier + mouseDistortion + audioDistortion) * scale + smoothMouseX * 0.4
                y = Math.sin(angle * 2 + time * 0.8 * rotDirection * speedMultiplier + smoothMouseX * 0.3 + smoothAudioFrequency * 0.05) * scale * (0.5 + mouseSpeed * 0.3 + smoothAudioLevel * 0.2) + offsetY + smoothMouseY * 0.4
                z = Math.cos(angle * 3 + time * 1.0 * speedMultiplier + timeOffset + smoothMouseY * 0.2) * (0.3 + mouseSpeed * 0.2 + smoothAudioLevel * 0.2)
                
                // Add twist influenced by mouse movement and audio
                const twist = angle * 2 + time * 1.2 * rotDirection * speedMultiplier + mouseVelX * 0.5 + smoothAudioLevel * 2
                const cosT = Math.cos(twist)
                const sinT = Math.sin(twist)
                const tempY = y
                y = tempY * cosT - z * sinT
                z = tempY * sinT + z * cosT
                
            } else {
                // Twisted torus/pretzel pattern that responds to mouse and audio
                const audioScale = 1 + smoothAudioLevel * 0.6  // Increased audio scale for more visual response
                const majorRadius = radius * audioScale + Math.sin(time * 0.8 * speedMultiplier + timeOffset) * (0.15 + mouseInfluence)
                const minorRadius = 0.3 + Math.cos(time * 1.0 * speedMultiplier + timeOffset) * (0.1 + mouseSpeed * 0.2) + smoothAudioLevel * 0.2
                
                const mouseWarp = smoothMouseX * 0.4 + smoothMouseY * 0.3  // Strong mouse warping
                const audioWarp = Math.cos(smoothAudioFrequency * 3) * smoothAudioLevel * 0.3  // Added frequency warping back for more ripples
                
                // Torus gravitates towards mouse and pulses with audio
                x = (majorRadius + minorRadius * Math.cos(angle * 3 + time * 1.5 * rotDirection * speedMultiplier + mouseWarp + audioWarp)) * Math.cos(angle + time * 0.8 * rotDirection * speedMultiplier + smoothMouseY * 0.3 + smoothAudioFrequency * 0.03) + smoothMouseX * 0.35
                y = (majorRadius + minorRadius * Math.cos(angle * 3 + time * 1.5 * rotDirection * speedMultiplier + mouseWarp + audioWarp)) * Math.sin(angle + time * 0.8 * rotDirection * speedMultiplier + smoothMouseX * 0.3) * (0.6 + smoothAudioLevel * 0.15) + offsetY + smoothMouseY * 0.35
                z = minorRadius * Math.sin(angle * 3 + time * 1.5 * rotDirection * speedMultiplier + timeOffset + mouseWarp + audioWarp) * (0.8 + mouseSpeed * 0.3 + smoothAudioLevel * 0.2)
                
                // Add additional twist influenced by mouse velocity and audio
                const twist = angle * 1.5 + time * 1.8 * rotDirection * speedMultiplier + mouseVelY * 0.6 + smoothAudioLevel * 1.5
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
        return new THREE.TubeGeometry(curve, 100, lineThickness, 8, true) // Use adjustable line thickness
    }
    
    function animate() {
        if (!isAnimating) return
        
        // Dynamic time increment based on mouse speed, audio, and animation speed control
        const audioSpeedBoost = Math.min(smoothAudioLevel * 2, 0.6) // Increased audio speed impact for more responsiveness
        const speedFactor = 1 + Math.min(mouseSpeed * 2, 1) + audioSpeedBoost
        time += baseTimeIncrement * speedFactor * animationSpeed
        frameCount++
        
        // Update film grain shader time for both materials
        filmGrainMaterial1.uniforms.time.value = time
        filmGrainMaterial2.uniforms.time.value = time
        
        // Only update geometries every 3 frames to reduce memory allocation
        if (frameCount % 3 === 0) {
            // Dispose old geometries before creating new ones to prevent memory leak
            if (geometry1) geometry1.dispose()
            if (geometry2) geometry2.dispose()
            
            // Update geometries with different curve types - increased audio impact for more responsiveness
            geometry1 = createTwistedCurveGeometry(1.1 + smoothAudioLevel * 0.5, 0.2, 0, 1, 'figure8')
            geometry2 = createTwistedCurveGeometry(0.9 + smoothAudioLevel * 0.4, -0.2, Math.PI, -1, 'torus')
        }
        
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

    // Track mouse values without effects
    let targetMouseX = 0
    let targetMouseY = 0
    
    // Only update target values when mouse actually moves
    $effect(() => {
        targetMouseX = mouseX
        targetMouseY = mouseY
    })
    
    // Separate animation frame for smooth mouse tracking
    let mouseTrackingFrame
    let mouseFrameCount = 0
    function updateMouseSmoothing() {
        mouseFrameCount++
        
        // Apply heavy smoothing to mouse position
        smoothMouseX = smoothMouseX * 0.95 + targetMouseX * 0.05  // Even heavier smoothing
        smoothMouseY = smoothMouseY * 0.95 + targetMouseY * 0.05
        
        // Apply heavy smoothing to audio values to prevent stuttering - only update every few frames
        if (mouseFrameCount % 5 === 0) {  // Update audio values less frequently to reduce computational load
            smoothAudioLevel = smoothAudioLevel * 0.95 + Math.min(Math.max(audioLevel || 0, 0), 0.3) * 0.05  // Further reduced impact and update rate
            smoothAudioFrequency = smoothAudioFrequency * 0.95 + Math.min(Math.max(audioFrequency || 0, 0), 3) * 0.05  // Further reduced impact
        }
        
        // Calculate velocity for dynamic movement
        const deltaX = smoothMouseX - prevMouseX
        const deltaY = smoothMouseY - prevMouseY
        
        // Allow larger velocity for more dynamic movement
        mouseVelX = Math.max(-0.1, Math.min(0.1, deltaX))
        mouseVelY = Math.max(-0.1, Math.min(0.1, deltaY))
        
        // Calculate speed with higher cap for more dynamic animation
        const rawSpeed = Math.sqrt(mouseVelX * mouseVelX + mouseVelY * mouseVelY)
        mouseSpeed = Math.min(rawSpeed * 10, 0.5)  // Increase sensitivity and max value
        
        // Always update for smoother gravitation effect
        // Curves gravitate towards mouse position
        const gravityStrength = 0.6  // How strongly curves are pulled to mouse
        const velocityInfluence = 1.2  // How much velocity affects movement
        
        // Curve 1 gravitates strongly towards mouse
        const target1X = smoothMouseX * gravityStrength + mouseVelX * velocityInfluence
        const target1Y = smoothMouseY * gravityStrength + mouseVelY * velocityInfluence
        const targetRot1Y = smoothMouseX * 0.3 + mouseVelX * 0.5
        const targetRot1X = smoothMouseY * 0.3 + mouseVelY * 0.5
        
        // Curve 2 gravitates with some offset for variety
        const target2X = smoothMouseX * (gravityStrength * 0.8) + mouseVelX * (velocityInfluence * 0.9)
        const target2Y = smoothMouseY * (gravityStrength * 0.8) + mouseVelY * (velocityInfluence * 0.9)
        const targetRot2Y = smoothMouseX * 0.25 - mouseVelX * 0.4
        const targetRot2X = smoothMouseY * 0.25 - mouseVelY * 0.4
        
        // Speed affects rotation dynamically
        const speedRotation = mouseSpeed * 2
        
        // Update positions with strong gravitation effect and increased audio influence for more responsiveness
        curve1Position.set([target1X + smoothAudioLevel * 0.2, target1Y + smoothAudioLevel * 0.15, mouseSpeed * 0.5 + smoothAudioLevel * 0.2])
        curve1Rotation.set([targetRot1X + smoothAudioFrequency * 0.01, targetRot1Y + smoothAudioLevel * 0.3, speedRotation + smoothAudioLevel * 0.4])
        
        curve2Position.set([target2X + smoothAudioLevel * 0.15, target2Y + smoothAudioLevel * 0.12, -mouseSpeed * 0.3 + smoothAudioLevel * 0.15])
        curve2Rotation.set([targetRot2X + smoothAudioFrequency * 0.008, targetRot2Y + smoothAudioLevel * 0.25, -speedRotation * 0.8 + smoothAudioLevel * 0.3])
        
        // Store previous position
        prevMouseX = smoothMouseX
        prevMouseY = smoothMouseY
        
        mouseTrackingFrame = requestAnimationFrame(updateMouseSmoothing)
    }
    
    // Start mouse smoothing
    updateMouseSmoothing()
    
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
        if (mouseTrackingFrame) {
            cancelAnimationFrame(mouseTrackingFrame)
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
{#each Array(50) as _, i}
    {@const angle1 = (i / 50) * Math.PI * 8}
    {@const angle2 = (i / 50) * Math.PI * 6}
    {@const radius = 0.5 + (i % 10) * 0.3}
    {@const height = ((i % 20) - 10) * 0.2}
    <T.Mesh position={[
        Math.sin(angle1 + time * (0.2 + smoothAudioLevel * 0.5)) * radius * (1 + smoothAudioLevel * 0.3) + Math.cos(i * 0.1 + time * 0.3) * 0.5 + smoothMouseX * 0.3,
        Math.cos(angle2 + time * (0.15 + smoothAudioLevel * 0.4)) * radius * 0.6 * (1 + smoothAudioLevel * 0.25) + height + Math.sin(i * 0.05 + time * 0.2) * 0.3 + smoothMouseY * 0.3,
        Math.sin(angle1 * 0.7 + time * (0.25 + smoothAudioFrequency * 0.03)) * 0.8 + Math.cos(i * 0.03 + time * 0.1) * 0.4
    ]}>
        <T.SphereGeometry args={[0.003 + (i % 5) * 0.001 + smoothAudioLevel * 0.002]} />
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
        Math.sin(i * Math.PI / 4 + time * (0.6 + smoothAudioLevel * 1.5)) * (1.4 + mouseSpeed * 2 + smoothAudioLevel * 0.6) + smoothMouseX * 0.5, 
        Math.cos(i * Math.PI / 4 + time * (0.5 + smoothAudioLevel * 1.2)) * (0.8 + mouseSpeed * 1.5 + smoothAudioLevel * 0.5) + smoothMouseY * 0.5,
        Math.sin(i * 0.8 + time * (0.8 + smoothAudioFrequency * 0.08)) * (0.3 + mouseSpeed * 1 + smoothAudioLevel * 0.3)
    ]}>
        <T.SphereGeometry args={[0.006 + mouseSpeed * 0.02 + smoothAudioLevel * 0.005]} />
        <T.ShaderMaterial
            uniforms={filmGrainMaterial1.uniforms}
            vertexShader={filmGrainMaterial1.vertexShader}
            fragmentShader={filmGrainMaterial1.fragmentShader}
            transparent={true}
            side={THREE.DoubleSide}
        />
    </T.Mesh>
{/each} 