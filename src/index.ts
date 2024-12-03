import { Prisma, PrismaClientExtends } from '@prisma/client/extension'
import { DefaultArgs } from '@prisma/client/runtime/library'

import { Readable } from 'node:stream'

export default Prisma.defineExtension((client: PrismaClientExtends<DefaultArgs>) => {
  return client.$extends({
    model: {
      $allModels: {
        cursorStream<
          T,
          A extends Prisma.Args<T, 'findMany'> | undefined,
          R extends Prisma.Result<T, A, 'findMany'>[number],
          C extends ((dataset: R[]) => Promise<unknown[]>) | undefined
        >(
          this: T,
          findManyArgs: A,
          { batchSize, prefill, batchTransformer } = {} as {
            batchSize?: number
            prefill?: number
            batchTransformer?: C
          }
        ): Iterable<
          C extends Function ? (Awaited<ReturnType<C>>[number] extends object ? Awaited<ReturnType<C>>[number] : R) : R
        > {
          findManyArgs = findManyArgs ?? ({} as A)
          const context = Prisma.getExtensionContext(this)

          const take = batchSize || 100
          const highWaterMark = prefill || take * 2
          const cursorField = Object.keys(findManyArgs.cursor || {})[0] || 'id'

          if (findManyArgs.select && !findManyArgs.select[cursorField]) {
            throw new Error(`Must select cursor field "${cursorField}"`)
          }

          let cursorValue: number
          const readableStream = new Readable({
            objectMode: true,
            highWaterMark,
            async read() {
              try {
                const results = await (context as any).findMany({
                  ...findManyArgs,
                  take,
                  skip: cursorValue ? 1 : 0,
                  ...(cursorValue ? { cursor: { [cursorField]: cursorValue } } : {}),
                })
                const transformedResults = batchTransformer ? await batchTransformer(results) : results
                for (const result of transformedResults) {
                  this.push(result)
                }
                if (results.length < take) {
                  this.push(null)
                  return
                }
                cursorValue = (<any>results[results.length - 1])[cursorField]
              } catch (err: any) {
                this.destroy(err)
              }
            },
          })

          return readableStream as any
        },
      },
    },
  })
})
