// utils/ipfilter.js

function ipv4ToInt(ip) {
	const p = ip.split('.').map(Number)
	if (p.length !== 4 || p.some(x => x < 0 || x > 255 || isNaN(x)))
		throw new Error('Invalid IPv4')
	return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}

function expandIpv6(ip) {
	// Expands :: in IPv6 to full notation
	const parts = ip.split('::')
	let head = parts[0].split(':').filter(Boolean)
	let tail = parts[1] ? parts[1].split(':').filter(Boolean) : []
	let missing = 8 - (head.length + tail.length)
	const zeros = Array(missing).fill('0')
	return [...head, ...zeros, ...tail].map(p => p.padStart(4, '0')).join(':')
}

function ipv6ToArr(ip) {
	return expandIpv6(ip).split(':').map(x => parseInt(x, 16))
}

function isIpv6(ip) {
	return ip.includes(':')
}

function isIpv4(ip) {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)
}

function isIpInCidr(ip, cidr) {
	const [range, bitsStr] = cidr.split('/')
	const bits = parseInt(bitsStr, 10)
	if (!bitsStr || isNaN(bits)) throw new Error('Invalid CIDR bits')

	if (isIpv4(ip) && isIpv4(range)) {
		const mask = ~(2 ** (32 - bits) - 1) >>> 0
		return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask)
	} else if (isIpv6(ip) && isIpv6(range)) {
		const ipArr = ipv6ToArr(ip)
		const rangeArr = ipv6ToArr(range)
		const fullBits = 128
		let n = Math.floor(bits / 16)
		let remain = bits % 16
		for (let i = 0; i < n; i++) {
			if (ipArr[i] !== rangeArr[i]) return false
		}
		if (remain) {
			const mask = 0xffff << (16 - remain)
			if ((ipArr[n] & mask) !== (rangeArr[n] & mask)) return false
		}
		return true
	}
	return false
}

function isAllowed(ip, whitelist) {
	if (!Array.isArray(whitelist) || whitelist.length === 0) return false
	if (ip.startsWith('::ffff:')) ip = ip.slice(7)
	// Gestion IPv4 et IPv6 natif
	return whitelist.filter(Boolean).some(entry => {
		if (entry.includes('/')) {
			try { return isIpInCidr(ip, entry) } catch { return false }
		}
		// Gestion adresse en notation canonique pour IPv6
		if (isIpv6(entry) && isIpv6(ip)) {
			return expandIpv6(ip) === expandIpv6(entry)
		}
		return ip === entry
	})
}

function ipFilterMiddleware(allowedIps) {
	return (req, res, next) => {
		let ip = req.ip || req.connection.remoteAddress || ''
		if (ip.startsWith('::ffff:')) ip = ip.slice(7)
		if (!isAllowed(ip, allowedIps)) {
			res.status(403).send('Forbidden: IP not allowed')
			return
		}
		next()
	}
}

module.exports = { ipv4ToInt, expandIpv6, ipv6ToArr, isIpInCidr, isAllowed, ipFilterMiddleware }
