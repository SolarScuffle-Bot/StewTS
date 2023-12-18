const charZero = '0'
const empty: Readonly<Map<Factory<any, any, any, any, any>, any>> = new Map()

function band(string1: string, string2: string) {
    let result = ''
    const length1 = string1.length
    const length2 = string2.length
    const maxLength = Math.max(length1, length2)

    for (let i = 0; i < maxLength; i++) {
        const char1 = i < length1 ? string1[i] : '0'
        const char2 = i < length2 ? string2[i] : '0'
        result += char1 === '1' && char2 === '1' ? '1' : '0'
    }

    return result.replace(/0+$/, '') || '0'
}

function bor(string1: string, string2: string) {
    let result = ''
    const length1 = string1.length
    const length2 = string2.length
    const maxLength = Math.max(length1, length2)

    for (let i = 0; i < maxLength; i++) {
        const char1 = i < length1 ? string1[i] : '0'
        const char2 = i < length2 ? string2[i] : '0'
        result += char1 === '1' || char2 === '1' ? '1' : '0'
    }

    return result.replace(/0+$/, '') || '0'
}

function bxor(string1: string, string2: string) {
    let result = ''
    const length1 = string1.length
    const length2 = string2.length
    const maxLength = Math.max(length1, length2)

    for (let i = 0; i < maxLength; i++) {
        const char1 = i < length1 ? string1[i] : '0'
        const char2 = i < length2 ? string2[i] : '0'
        result += char1 === char2 ? '0' : '1'
    }

    return result.replace(/0+$/, '') || '0'
}

function bplace(place: number) {
    if (place <= 0) return '0'
    return '0'.repeat(place - 1) + '1'
}

function nextId(last: number) {
    const bytes = 1 + (Math.log2(last + 0.5) >> 3)

    let result = ''
    for (let i = 0; i < bytes; i++) {
        const charCode = last >> (8 * i) % 256
        result = String.fromCharCode(charCode) + result
    }

    return result
}

type Signature = string
type Components = Map<Factory<any, any, any, any, any>, any>
type Collection = Map<any, Components>

type Add<E, C, D, A extends unknown[], R extends unknown[]> = (
    factory: Factory<E, C, D, A, R>,
    entity: E,
    ...args: A
) => C

type Remove<E, C, D, A extends unknown[], R extends unknown[]> = (
    factory: Factory<E, C, D, A, R>,
    entity: E,
    component: C,
    ...args: R
) => void

interface EntityData {
    signature: Signature
    components: Components
}

interface Archetype<E, C, D, A extends unknown[], R extends unknown[]> {
    create: Add<E, C, D, A, R>
    delete: Remove<E, C, D, A, R>
    signature: Signature
    factory: Factory<E, C, D, A, R>
}

interface Factory<E, C, D, A extends unknown[], R extends unknown[]> {
    add: (entity: E, ...args: A) => C
    remove: (entity: E, ...args: R) => void
    get: (entity: E) => C | null
    data: D
    added: (entity: E, component: C) => void
    removed: (entity: E, component: C) => void
}

interface FactoryArgs<E, C, D, A extends unknown[], R extends unknown[]> {
    add: Add<E, C, D, A, R>
    remove?: Remove<E, C, D, A, R>
    data?: D
}

const tag = {
    add: (factory: Factory<any, null, undefined, any, any>, entity: any) =>
        null,
    remove: nop as (
        factory: Factory<any, null, undefined, any, any>,
        entity: any,
        component: null,
    ) => void,
    data: undefined,
}

interface World {
    _nextPlace: number
    _nextEntityId: number
    _factoryToData: Map<
        Factory<any, any, any, any, any>,
        Archetype<any, any, any, any, any>
    >
    _entityToData: Map<any, EntityData>
    _signatureToCollection: Map<Signature, Collection>
    _id: string

    built: <E, C, D, A extends unknown[], R extends unknown[]>(
        archetype: Archetype<E, C, D, A, R>,
    ) => void
    spawned: (entity: any) => void
    killed: (entity: any) => void
    added: <E, C, D, A extends unknown[], R extends unknown[]>(
        factory: Factory<E, C, D, A, R>,
        entity: E,
        component: C,
    ) => void
    removed: <E, C, D, A extends unknown[], R extends unknown[]>(
        factory: Factory<E, C, D, A, R>,
        entity: E,
        component: C,
    ) => void

    factory: <E, C, D, A extends unknown[], R extends unknown[]>(
        factoryArgs: FactoryArgs<E, C, D, A, R>,
    ) => Factory<E, C, D, A, R>
    tag: () => typeof tag
    entity: () => string
    kill: (entity: any) => void
    get: (entity: any) => Components
    query: (
        include: Factory<any, any, any, any, any>[],
        exclude?: Factory<any, any, any, any, any>[],
    ) => Collection | Error
}

interface Stew {
    _nextWorldId: number
    world: () => World
}

function getCollection(world: World, signature: string): Collection {
    const found = world._signatureToCollection.get(signature)
    if (found) return found

    const split = signature.split('!')
    const include = split[1]
    const exclude = split[2] || undefined

    const collection = new Map() as Collection
    world._signatureToCollection.set(signature, collection)

    const universal = world._signatureToCollection.get(charZero)!
    for (const [entity] of universal) {
        const data = world._entityToData.get(entity)!
        if (
            band(include, data.signature) === include &&
            (exclude === undefined ||
                band(exclude!, data.signature) === charZero)
        )
            collection[entity] = data.components
    }

    return collection
}

function nop() {}

function register(world: World, entity: any) {
    if (world._entityToData.get(entity) === undefined)
        return Error('Attempting to register entity twice')

    const entityData = {
        signature: charZero,
        components: new Map(),
    }

    world._entityToData.set(entity, entityData)

    getCollection(world, charZero).set(entity, entityData.components)

    world.spawned(entity)
}

function unregister(world: World, entity: any) {
    if (world._entityToData.get(entity) === undefined)
        return Error('Attempting to unregister entity twice')

    getCollection(world, charZero).delete(entity)
    world._entityToData.delete(entity)

    world.killed(entity)
}

function updateCollections(world: World, entity: any, entityData: EntityData) {
    const signature = entityData.signature

    for (const [
        collectionSignature,
        collection,
    ] of world._signatureToCollection) {
        const collectionSplit = collectionSignature.split('!')
        const collectionInclude = collectionSplit[0]
        const collectionExclude = collectionSplit[1]

        if (
            band(collectionInclude, signature) == collectionInclude &&
            (collectionExclude === undefined ||
                band(collectionExclude, signature) == charZero)
        )
            collection.set(entity, entityData.components)
        else collection.delete(entity)
    }
}

let Stew = {
    _nextWorldId: -1,
} as Stew

Stew.world = () => {
    let world = {
        _nextPlace: 1,
        _nextEntityId: -1,
        _factoryToData: new Map(),
        _entityToData: new Map() as Map<any, EntityData>,
        _signatureToCollection: new Map() as Map<Signature, Collection>,

        built: nop as <E, C, D, A extends unknown[], R extends unknown[]>(
            archetype: Archetype<E, C, D, A, R>,
        ) => void,
        spawned: nop as (entity: any) => void,
        killed: nop as (entity: any) => void,
        added: nop as <E, C, D, A extends unknown[], R extends unknown[]>(
            factory: Factory<E, C, D, A, R>,
            entity: E,
            component: C,
        ) => void,
        removed: nop as <E, C, D, A extends unknown[], R extends unknown[]>(
            factory: Factory<E, C, D, A, R>,
            entity: E,
            component: C,
        ) => void,
    } as World

    world._id = nextId(++Stew._nextWorldId)
    world._signatureToCollection.set(charZero, new Map())

    world.factory = <E, C, D, A extends unknown[], R extends unknown[]>(
        factoryArgs: FactoryArgs<E, C, D, A, R>,
    ) => {
        let factory = {
            added: nop as (entity: E, component: C) => void,
            removed: nop as (entity: E, component: C) => void,
            data: factoryArgs.data,
        } as Factory<E, C, D, A, R>

        const archetype = {
            factory: factory,
            signature: bplace(world._nextPlace),
            create: factoryArgs.add as Add<E, C, D, A, R>,
            delete: (factoryArgs.remove || nop) as Remove<E, C, D, A, R>,
        }

        factory.add = (entity, ...args) => {
            let maybeEntityData = world._entityToData.get(entity)
            if (maybeEntityData === undefined) {
                register(world, entity)
                maybeEntityData = world._entityToData.get(entity)
            }

            const entityData = maybeEntityData!

            if (entityData.components.has(factory))
                return entityData.components.get(factory)

            const component = archetype.create(factory, entity, ...args)
			if (component === undefined)
				return undefined

            entityData.components.set(factory, component)

            const signature = bor(entityData.signature, archetype.signature)
            entityData.signature = signature

            updateCollections(world, entity, entityData)

            factory.added(entity, component)
            world.added(factory, entity, component)

            return component
        }

        factory.remove = (entity, ...args) => {
        	const entityData = world._entityToData.get(entity)
        	if (entityData === undefined)
        		return

        	const component = entityData.components.get(factory)
        	if (component === undefined)
        		return

        	archetype.delete(factory, entity, component, ...args)

        	const signature = bxor(entityData.signature, archetype.signature)
        	entityData.signature = signature
        	entityData.components.delete(factory)

        	updateCollections(world, entity, entityData)

        	factory.removed(entity, component)
        	world.removed(factory, entity, component)

        	if (entityData.signature === charZero)
        		unregister(world, entity)
		}

        // function factory.get(entity: E): C?
        // 	local entityData = world._entityToData[entity]
        // 	return if entityData then entityData.components[factory] else nil
        // end

        world._factoryToData.set(factory, archetype)
        world._nextPlace++

        world.built(archetype)

        return factory
    }

    world.tag = () => world.factory(tag)

    world.entity = () => {
        const entity = nextId(++world._nextEntityId)
        return world._id + entity
    }

    world.kill = (entity, ...args) => {
        const entityData = world._entityToData.get(entity)
        if (entityData === undefined) return

        for (const [factory] of entityData.components)
            factory.remove(entity, args)
    }

    world.get = entity => {
        const data = world._entityToData.get(entity)
        return data !== undefined ? data.components : (empty as Components)
    }

    world.query = (include, exclude) => {
        let signatureInclude = charZero

        for (const factory of include) {
            const data = world._factoryToData.get(factory)
            if (data === undefined)
                return Error(
                    "Passed a non-factory or a different world's factory into an include query!",
                )

            signatureInclude = bor(signatureInclude, data.signature)
        }

        if (exclude !== undefined) {
            let signatureExclude = charZero

            for (const factory of exclude) {
                let data = world._factoryToData.get(factory)
                if (data === undefined)
                    return Error(
                        "Passed a non-factory or a different world's factory into an exclude query!",
                    )

                signatureExclude = bor(signatureExclude, data.signature)
            }

            signatureInclude += '!' + signatureExclude
        }

        return getCollection(world, signatureInclude)
    }

    return world
}

const world = Stew.world()

const f1 = world.factory({
	add: (factory, entity: any, x: number, y: number, z: number) => {
		return [x, y, z]
	},
	remove: (factory, entity: any) => {
		console.log(entity, 'Removing!')
	},
	data: 5,
})

f1.add()

export default Stew
// return Stew
