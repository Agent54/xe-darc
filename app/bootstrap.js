export default [
    {
        _id: 'darc:space_default',
        spaceId: 'darc:space_default',
        type: 'space',
        name: 'Default',
        created: Date.now(),
        order: 1
    },
    // {
	// 	_id: '_design/darc',
	// 	version: 1,
	// 	language: "javascript_quickjs",
	// 	options: {
	// 		partitioned: false
	// 	},

	// 	filters: {
	// 		preload: function (doc) {
	// 			const prefix = doc._id.split('_')[0]
			  	
	// 			return [
	// 				'darc:favorites'
	// 			].includes(prefix)
	// 		}.toString()
	// 	},

	// 	views: {
	// 		spaces: {
	// 			map: function (doc) {
	// 				if (doc.deleted || !['tab', 'space', 'divider'].includes(doc.type)) {
	// 					return
	// 				}

    //                 let spaceId = 'darc:space_default'

    //                 if (doc.closed) {
    //                     spaceId = 'darc:space__global'
    //                 } else if (doc.type === 'space') {
    //                     spaceId = doc._id
    //                 } else if (doc.spaceId) {
    //                     spaceId = doc.spaceId
    //                 }

    //                 let groupOrder = 1
    //                 if (doc.type === 'space') {
    //                     groupOrder = 1
    //                 } else if (doc.pinned === 'app') {
    //                     groupOrder = 2
    //                 } else if (doc.pinned) {
    //                     groupOrder = 3
    //                 } else if (!doc.tabGroup && (doc.type === 'tab' || doc.type === 'divider' || doc.type === 'group')) {
    //                     groupOrder = 4
    //                 } else if (doc.tabGroup) {
    //                     groupOrder = 5
    //                 }

    //                 let order
    //                 if (doc.order) {
    //                     order = doc.order
    //                 } else {
    //                     order = doc.modified || doc.created || Date.now()
    //                 }

    //                 // @ts-ignore
	// 				emit([
	// 					spaceId,
	// 					groupOrder,
	// 					-order
	// 				])
	// 			}.toString()

	// 			// reduce: function (_keys, values) {
	// 			// 	return values.reduce(
	// 			// 		(acc, value) => {
	// 			// 			return {
	// 			// 				blocking: acc.blocking.concat(value.blocking)
	// 			// 			}
	// 			// 		},
	// 			// 		{ blocking: [] }
	// 			// 	)
	// 			// }.toString()
	// 		}
    //     }
    // }
]
